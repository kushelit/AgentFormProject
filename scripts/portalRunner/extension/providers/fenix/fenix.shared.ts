import { providerAuthenticated, waitForProviderAuthentication, continueIfAuthenticated } from '../../auth-providers';
// Ported from the native provider; browser report keys replace local files.
import type { Page, Download, BrowserContext } from "../../browser";
import type { RunnerCtx } from "../../types";
export async function waitPhoenixLoaderGone(page: Page, timeoutMs = 30000) {
    try {
        const loaderScript = `() => {
      const selectors = ['.loading', '.spinner', '.overlay', '[class*="loader"]', '.k-loading-mask'];
      const nodes = selectors.flatMap(sel => Array.from(document.querySelectorAll(sel)));
      if (!nodes.length) return true;
      return nodes.every(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden' || el.offsetWidth === 0;
      });
    }`;
        await page.waitForFunction(loaderScript, { timeout: timeoutMs });
    }
    catch (e) {
    }
}
async function waitForSelectorFast(page: Page, selector: string, timeoutMs = 15000, state: "visible" | "attached" = "visible"): Promise<boolean> {
    try {
        await page.waitForSelector(selector, { timeout: timeoutMs, state });
        return true;
    }
    catch (e) {
        return false;
    }
}
async function closeInitialModals(page: Page) {
    try {
        const approveBtn = page.locator('button:has-text("זה בסדר"), button:has-text("אישור")').first();
        if (await approveBtn.isVisible({ timeout: 5000 })) {
            await approveBtn.click({ force: true });
            await page.waitForTimeout(2000);
        }
        const xBtn = page.locator('button .icon-close, .modal-close, [aria-label="Close"]').first();
        if (await xBtn.isVisible({ timeout: 2000 })) {
            await xBtn.click({ force: true });
        }
    }
    catch (e) {
    }
}
export async function handleFenixLoginRedirect(page: Page) {
    const url = page.url();
    if (url.includes("errorcode=19") || url.includes("logout")) {
        try {
            const returnBtn = page.getByText("חזרה למסך כניסה").first();
            await returnBtn.waitFor({ state: "visible", timeout: 8000 });
            await returnBtn.click({ force: true });
            await page.waitForURL("**/my.policy", { timeout: 20000 }).catch(() => { });
        }
        catch (e) {
            await page.goto("https://agent.fnx.co.il/my.policy", { waitUntil: "domcontentloaded" });
        }
    }
}
async function safeEvaluateBool(page: Page, script: string, fallback: boolean): Promise<boolean> {
    try {
        const result = await page.evaluate(script);
        return result === true;
    }
    catch (e: any) {
        if (String(e?.message || '').includes('Execution context was destroyed')) {
            return fallback;
        }
        throw e;
    }
}
export async function phoenixHasLoginError(page: Page): Promise<boolean> {
    return safeEvaluateBool(page, `
    (function() {
      const header = document.getElementById('credentials_table_header');
      if (!header) return false;
      const title = header.querySelector('.title');
      const txt = title ? (title.innerText || title.textContent || '').trim() : '';
      return txt.includes('לא זיהינו אותך');
    })()
  `, false);
}
export async function phoenixLogin(page: Page, username: string, password: string) {
    if (await providerAuthenticated(page,'fenix')) return;
    const injection = `
    (function(u, p) {
      return new Promise(resolve => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const user = document.querySelector('#input_1');
          const pass = document.querySelector('#input_2');
          const btn  = document.querySelector('input[type="submit"], button[type="submit"], #btLogin');
          if (user && pass && btn) {
            clearInterval(interval);
            user.value = u;
            pass.value = p;
            user.dispatchEvent(new Event('input', {bubbles:true}));
            pass.dispatchEvent(new Event('input', {bubbles:true}));
            pass.dispatchEvent(new Event('change', {bubbles:true}));
            btn.click();
            resolve("SUCCESS");
          }
          if (attempts > 60) { clearInterval(interval); resolve("TIMEOUT"); }
        }, 500);
      });
    })('${username.replace(/'/g, "\\'")}', '${password.replace(/'/g, "\\'")}')
  `;
    try {
        await page.evaluate(injection);
    }
    catch (e: any) {
        if (!String(e?.message || '').includes('Execution context was destroyed')) {
            throw e;
        }
    }
    await page.waitForTimeout(8000);
    const hasLoginError = await phoenixHasLoginError(page);
    if (hasLoginError) {
        throw new Error('פניקס: פרטי ההתחברות (ת.ז/סיסמה) שגויים - הפורטל הציג "לא זיהינו אותך"');
    }
}
export async function phoenixHasWrongTokenError(page: Page): Promise<boolean> {
    return safeEvaluateBool(page, `
    (function() {
      const cell = document.getElementById('credentials_table_postheader');
      if (!cell) return false;
      const msg = cell.querySelector('.error_message');
      const txt = msg ? (msg.innerText || msg.textContent || '').trim() : '';
      return txt.includes('הקוד שהזנת שגוי');
    })()
  `, false);
}
async function injectOtpCode(page: Page, otpCode: string) {
    const injection = `
    (function(code) {
      return new Promise(resolve => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const input = document.querySelector('#input_2');
          const btn = document.querySelector('input[type="submit"], button[type="submit"]');
          if (input && btn) {
            clearInterval(interval);
            input.value = code;
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
            btn.click();
            resolve("SUCCESS");
          }
          if (attempts > 40) { clearInterval(interval); resolve("TIMEOUT"); }
        }, 500);
      });
    })('${otpCode}')
  `;
    try {
        await page.evaluate(injection);
    }
    catch (e: any) {
        if (!String(e?.message || '').includes('Execution context was destroyed')) {
            throw e;
        }
    }
    await page.waitForTimeout(8000);
}
export async function phoenixHandleOtp(page: Page, ctx: RunnerCtx) {
    if (await continueIfAuthenticated(page,ctx,'fenix')) return;
    const { runId, setStatus, pollOtp, clearOtp } = ctx;
    await setStatus(runId, { status: "otp_required", step: "ממתין לקוד זיהוי", "otp.mode": "firestore" });
    let authentication_otpCode = await waitForProviderAuthentication(page,ctx,'fenix');
    if (authentication_otpCode.kind === 'authenticated') return;
    let otpCode = authentication_otpCode.code;
    if (!otpCode)
        throw new Error("OTP Timeout");
    await injectOtpCode(page, otpCode);
    await clearOtp(runId).catch(() => { });
    const wrongToken = await phoenixHasWrongTokenError(page);
    if (wrongToken) {
        await setStatus(runId, {
            status: "otp_required",
            step: "הקוד הקודם היה שגוי - נסה שוב",
            "otp.mode": "firestore"
        });
        authentication_otpCode = await waitForProviderAuthentication(page,ctx,'fenix');
        if (authentication_otpCode.kind === 'authenticated') return;
        otpCode = authentication_otpCode.code;
        if (!otpCode)
            throw new Error("OTP Timeout (ניסיון שני)");
        await injectOtpCode(page, otpCode);
        await clearOtp(runId).catch(() => { });
        const stillWrong = await phoenixHasWrongTokenError(page);
        if (stillWrong) {
            throw new Error('פניקס: קוד הזיהוי שגוי גם בניסיון השני - הפורטל הציג "הקוד שהזנת שגוי"');
        }
    }
}
export async function navigateToPhoenixCommissions(page: Page) {
    await waitPhoenixLoaderGone(page, 20000);
    await page.waitForTimeout(1500);
    const commsResult = await page.evaluate<string>(`
    (function() {
      // חיפוש לפי aria-label מדויק או טקסט פנימי
      const btn = document.querySelector('button[aria-label="עמלות"]') ||
                  Array.from(document.querySelectorAll('button, span, a'))
                       .find(el => el.innerText?.trim() === 'עמלות' || el.getAttribute('aria-label') === 'עמלות');

      if (btn) {
        const clickable = btn.closest('button') || btn.closest('a') || btn;
        clickable.click();
        return "SUCCESS";
      }
      return "ERROR_COMMS_NOT_FOUND";
    })()
  `);
    if (commsResult.startsWith("ERROR")) {
        throw new Error("לא נמצא פריט 'עמלות' בתפריט הצד");
    }
}
export async function navigateToPhoenixPaymentsSummary(page: Page) {
    await page.waitForFunction(() => {
        return !!document.querySelector('a[href*="payments-report"]') ||
            Array.from(document.querySelectorAll('a')).some(a => (a.innerText || '').trim() === 'ריכוז תשלומי עמלות');
    }, { timeout: 15000 }).catch(() => { });
    const result = await page.evaluate<string>(`
    (function() {
      const els = Array.from(document.querySelectorAll('a, span, button'));
      const target = els.find(el => {
        const txt = (el.innerText || el.textContent || "").trim();
        const href = el.getAttribute && el.getAttribute('href');
        return txt === 'ריכוז תשלומי עמלות' || (href && href.includes('payments-report'));
      });
      if (target) {
        const clickable = target.closest('a') || target.closest('button') || target;
        clickable.click();
        return "CLICKED";
      }
      return "NOT_FOUND";
    })()
  `);
    if (result === "NOT_FOUND") {
        throw new Error('לא נמצא הקישור "ריכוז תשלומי עמלות" בתפריט העמלות');
    }
    await page.waitForURL(/payments-report/, { timeout: 20000 }).catch(() => { });
}
async function pollForSelector(page: Page, selector: string, maxAttempts = 30, intervalMs = 500): Promise<boolean> {
    const result = await page.evaluate(`
    (function(sel, maxAttempts, intervalMs) {
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (document.querySelector(sel)) {
            clearInterval(interval);
            resolve("FOUND");
          }
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            resolve("TIMEOUT");
          }
        }, intervalMs);
      });
    })('${selector.replace(/'/g, "\\'")}', ${maxAttempts}, ${intervalMs})
  `);
    return result === "FOUND";
}
export async function phoenixSearchAndSelectCompany(page: Page, taxId: string) {
    if (!taxId) {
        return;
    }
    const openComboResult = await page.evaluate<string>(`
    (function() {
      const spans = Array.from(document.querySelectorAll('span'));
      const idSpan = spans.find(el => {
        const txt = (el.innerText || el.textContent || '').trim();
        return txt.includes('ח.פ') && txt.includes('ת.ז');
      });
      if (!idSpan) return "ID_SPAN_NOT_FOUND";

      const container = idSpan.closest('span.flex') || idSpan.parentElement;
      if (!container) return "CONTAINER_NOT_FOUND";

      const matSelect = container.querySelector('fnx-nx-fnx-mat-select');
      if (!matSelect) return "MATSELECT_NOT_FOUND";

      const specificTrigger = matSelect.querySelector('[role="combobox"], mat-select, .mat-mdc-select-trigger');
      const target = specificTrigger || matSelect;

      target.scrollIntoView({ block: 'center' });
      const rect = target.getBoundingClientRect();
      const opts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      };
      target.dispatchEvent(new MouseEvent('pointerdown', opts));
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      target.dispatchEvent(new MouseEvent('pointerup', opts));
      target.dispatchEvent(new MouseEvent('mouseup', opts));
      target.dispatchEvent(new MouseEvent('click', opts));

      return "CLICKED";
    })()
  `);
    if (openComboResult === "ID_SPAN_NOT_FOUND") {
        throw new Error('לא נמצא ה-span עם הטקסט "ח.פ/ת.ז" ליד כותרת הדוח');
    }
    if (openComboResult === "CONTAINER_NOT_FOUND") {
        throw new Error('נמצא ה-span "ח.פ/ת.ז" אך לא נמצא קונטיינר משותף מסביבו');
    }
    if (openComboResult === "MATSELECT_NOT_FOUND") {
        throw new Error('נמצא הקונטיינר של "ח.פ/ת.ז" אך לא נמצא בתוכו הרכיב fnx-nx-fnx-mat-select');
    }
    const PANEL_SELECTOR = 'div[role="listbox"].mat-mdc-select-panel';
    const inputReady = await pollForSelector(page, 'div[role="listbox"].mat-mdc-select-panel input[aria-label="חיפוש"]', 30, 500);
    if (!inputReady) {
        throw new Error('בורר החברה (ליד "ח.פ/ת.ז") נלחץ אך שדה החיפוש בתוך הפאנל לא נמצא');
    }
    const openInputResult = await page.evaluate<string>(`
    (function() {
      const listbox = document.querySelector('div[role="listbox"].mat-mdc-select-panel');
      const input = listbox ? listbox.querySelector('input[aria-label="חיפוש"], input[aria-label*="חיפוש"]') : null;
      if (input) {
        input.click();
        input.focus();
        return "FOUND";
      }
      return "NOT_FOUND";
    })()
  `);
    if (openInputResult === "NOT_FOUND") {
        throw new Error('לא נמצא שדה חיפוש בתוך פאנל בורר החברה');
    }
    await page.waitForTimeout(300);
    await page.keyboard.type(taxId, { delay: 70 });
    const found = await waitForSelectorFast(page, `${PANEL_SELECTOR} :text("${taxId}")`, 8000, "attached").catch(() => false);
    const selectResult = await page.evaluate<string>(`
    (function(id) {
      const listbox = document.querySelector('div[role="listbox"].mat-mdc-select-panel');
      if (!listbox) return "LISTBOX_GONE";
      const options = Array.from(listbox.querySelectorAll('mat-option'));
      const match = options.find(el => (el.innerText || el.textContent || '').includes(id));
      if (match) {
        match.click();
        return "SELECTED";
      }
      return "NOT_FOUND";
    })('${taxId.replace(/'/g, "\\'")}')
  `);
    if (selectResult === "NOT_FOUND" || selectResult === "LISTBOX_GONE") {
        throw new Error(`לא נמצאה/נבחרה תוצאה מתאימה לח.פ ${taxId} בתוך פאנל בורר החברה (${selectResult})`);
    }
    await page.waitForTimeout(3000);
}
export type ReportMatch = {
    include: string[];
    exclude?: string[];
    exact?: string;
};
export async function phoenixOpenReportByMatch(mainPage: Page, match: ReportMatch): Promise<Page> {
    const openScript = `
    (function() {
      const include = ${JSON.stringify(match.include)};
      const exclude = ${JSON.stringify(match.exclude || [])};
      const exact = ${JSON.stringify(match.exact || null)};
      const elements = Array.from(document.querySelectorAll('li span, a span, span, button, a'));
      const matches = elements.filter(el => {
        const txt = (el.innerText || el.textContent || "").trim();
        if (!txt) return false;
        if (exact !== null) return txt === exact;
        const hasAllInclude = include.every(k => txt.includes(k));
        const hasNoExclude = exclude.every(k => !txt.includes(k));
        return hasAllInclude && hasNoExclude;
      });

      if (matches.length === 0) return "NOT_FOUND";
      if (matches.length > 1) {
        const texts = matches.map(el => (el.innerText || el.textContent || "").trim());
        return "AMBIGUOUS::" + JSON.stringify(texts);
      }

      const target = matches[0];
      target.scrollIntoView({ block: 'center' });
      const clickable = target.closest('button') || target.closest('a') || target;
      clickable.click();
      return "CLICKED";
    })()
  `;
    const context = mainPage.context();
    for (let attempt = 1; attempt <= 2; attempt++) {
        const pagePromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
        const res = await mainPage.evaluate<string>(openScript);
        if (res === "NOT_FOUND") {
            throw new Error(`דוח עם מילות המפתח ${JSON.stringify(match)} לא נמצא בדף ריכוז תשלומי עמלות`);
        }
        if (res.startsWith("AMBIGUOUS::")) {
            const texts = res.slice("AMBIGUOUS::".length);
            throw new Error(`נמצאה יותר מהתאמה אחת עבור מילות המפתח ${JSON.stringify(match)} - צריך קריטריון מדויק יותר. שורות שנמצאו: ${texts}`);
        }
        const newPage = await pagePromise;
        if (newPage) {
            await newPage.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => { });
            await newPage.waitForTimeout(3000);
            return newPage;
        }
        if (attempt === 1) {
            await mainPage.waitForTimeout(3000);
        }
    }
    let screenshotPath = "";
    try {
        screenshotPath = `./fenix_report_open_failure_${Date.now()}.png`;
        await mainPage.screenshot({ path: screenshotPath, fullPage: true });
    }
    catch (e) {
    }
    throw new Error(`הדוח נלחץ פעמיים אך לא נפתח טאב חדש - ייתכן שדפי F5 ביניים "בולעים" את הלחיצה. קריטריון: ${JSON.stringify(match)}` +
        (screenshotPath ? ` | צילום מסך לאבחון: ${screenshotPath}` : ""));
}
export async function phoenixOpenReport(mainPage: Page, reportName: string): Promise<Page> {
    const context = mainPage.context();
    const pagePromise = context.waitForEvent('page', { timeout: 20000 }).catch(() => null);
    const openScript = `
    (function() {
      const nameToFind = ${JSON.stringify(reportName.trim())};
      const elements = Array.from(document.querySelectorAll('li span, a span, span, button, a'));
      const target = elements.find(el => {
        const txt = el.innerText || el.textContent || "";
        return txt.trim() === nameToFind;
      });

      if (target) {
        target.scrollIntoView({ block: 'center' });
        // מחפשים את האלמנט הקליקבילי הקרוב ביותר (כפתור או לינק)
        const clickable = target.closest('button') || target.closest('a') || target;
        clickable.click();
        return "CLICKED";
      }
      return "NOT_FOUND";
    })()
  `;
    const res = await mainPage.evaluate<string>(openScript);
    if (res === "NOT_FOUND") {
        throw new Error(`הדוח "${reportName}" לא נמצא בדף העמלות`);
    }
    const newPage = await pagePromise;
    if (newPage) {
        await newPage.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => { });
        await waitPhoenixLoaderGone(newPage, 20000);
        return newPage;
    }
    return mainPage;
}
export async function phoenixExportExcel(page: Page, log?: any): Promise<Download | null> {
    const info = (msg: string) => {
        if (log?.info)
            log.info(msg);
    };
    const filterCheckScript = `
    (function() {
      const btn = document.querySelector('#restoreFiltersElem');
      if (!btn) return 'NO_BUTTON';
      if (btn.disabled) return 'ALREADY_CLEAN';
      btn.click();
      return 'CLICKED';
    })()
  `;
    let clearFilterResult = 'EVAL_FAILED';
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            clearFilterResult = await page.evaluate(filterCheckScript);
            break;
        }
        catch (e: any) {
            info(`[Fenix] Filter check attempt ${attempt + 1} threw: ${e?.message || e}`);
            clearFilterResult = 'EVAL_FAILED';
            await page.waitForTimeout(1000);
        }
    }
    info(`[Fenix] Filter check result: ${clearFilterResult}`);
    if (clearFilterResult === 'CLICKED') {
        info('[Fenix] Active filter detected on report - cleared via ניקוי סינון before export.');
        await page.waitForTimeout(2000);
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => { });
    }
    const excelReady = await pollForSelector(page, 'fnx-nx-client-gemel-continuous-table-export-to-excel button, fnx-nx-client-continuous-table-export-to-excel button, img[src*="excel"]', 60, 500);
    if (!excelReady) {
        throw new Error('לא נמצא כפתור/אייקון אקסל בדוח תוך 30 שניות - ייתכן שהטאב לא נטען כראוי (דף F5?)');
    }
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    const injectionScript = `
    (function() {
      const container = document.querySelector('fnx-nx-client-gemel-continuous-table-export-to-excel, fnx-nx-client-continuous-table-export-to-excel');
      let mainBtn = container ? container.querySelector('button') : null;

      if (!mainBtn) {
        const img = document.querySelector('img[src*="excel"]');
        mainBtn = img ? (img.closest('button') || img) : null;
      }

      if (!mainBtn) return "NOT_FOUND";

      mainBtn.click();

      setTimeout(() => {
        const menuItems = Array.from(document.querySelectorAll('.mat-mdc-menu-item, .mat-menu-item, [role="menuitem"]'));
        const extended = menuItems.find(el => {
          const txt = el.innerText || el.textContent || "";
          return txt.includes("מורחב");
        });

        if (extended) {
          extended.click();
        }
      }, 2000);

      return "CLICKED_MAIN";
    })()
  `;
    let res: string;
    try {
        res = await page.evaluate(injectionScript);
    }
    catch (e: any) {
        if (String(e?.message || '').includes('Execution context was destroyed')) {
            throw new Error('הלחיצה על כפתור האקסל בוצעה תוך כדי ניווט (F5?) - לא ברור אם ההורדה התחילה');
        }
        throw e;
    }
    if (res === "NOT_FOUND") {
        throw new Error('כפתור האקסל אותר אך נעלם לפני שהספקנו ללחוץ עליו');
    }
    try {
        return await downloadPromise;
    }
    catch (e: any) {
        throw new Error(`נלחץ על כפתור האקסל אך ההורדה לא התחילה תוך 60 שניות: ${e?.message || e}`);
    }
}
