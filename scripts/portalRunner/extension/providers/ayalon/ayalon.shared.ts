import { providerAuthenticated, waitForProviderAuthentication, continueIfAuthenticated } from '../../auth-providers';
// Ported from the native provider; browser report keys replace local files.
import type { BrowserContext, Page } from "../../browser";
import type { RunnerCtx } from "../../types";
import { reportPath as path } from "../../report-store";
function escJsString(v: string) {
    return String(v ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}
export async function ayalonLogin(page: Page, u: string, p: string) {
    if (await providerAuthenticated(page,'ayalon')) return;
    const user = escJsString(u);
    const pass = escJsString(p);
    const injection = `
    (function(user, pass) {
      return new Promise((resolve) => {
        let attempts = 0;
        const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;

        const interval = setInterval(() => {
          attempts++;

          const userInputs = Array.from(document.querySelectorAll('#input_1'));
          const passInputs = Array.from(document.querySelectorAll('#input_2'));
          const submitCandidates = Array.from(
            document.querySelectorAll('input[type="submit"], .credentials_input_submit')
          );

          const uInput = userInputs.find(isVisible);

          const pInput = passInputs.find((el) => {
            if (!isVisible(el)) return false;
            const placeholder = String(el.getAttribute('placeholder') || '').trim();
            const alt = String(el.getAttribute('alt') || '').trim();

            return (
              placeholder.includes("סיסמא") ||
              placeholder.includes("סיסמה") ||
              alt.includes("סיסמא") ||
              alt.includes("סיסמה")
            );
          });

          const btn = submitCandidates.find(isVisible);

          if (uInput && pInput && btn) {
            clearInterval(interval);

            uInput.value = user;
            pInput.value = pass;

            ['input', 'change', 'blur'].forEach((ev) => {
              uInput.dispatchEvent(new Event(ev, { bubbles: true }));
              pInput.dispatchEvent(new Event(ev, { bubbles: true }));
            });

            setTimeout(() => {
              btn.click();
              resolve("SUBMITTED");
            }, 500);

            return;
          }

          if (attempts > 60) {
            clearInterval(interval);
            resolve("TIMEOUT_FIELDS_NOT_FOUND");
          }
        }, 500);
      });
    })('${user}', '${pass}')
  `;
    const result = await page.evaluate(injection);
    if (result !== "SUBMITTED") {
        throw new Error(`לוגין לאיילון נכשל: ${String(result)}`);
    }
}
export async function ayalonHandleOtp(page: Page, ctx: RunnerCtx) {
    if (await continueIfAuthenticated(page,ctx,'ayalon')) return;
    const { runId, pollOtp, clearOtp, setStatus, run } = ctx;
    const monthLabel = run?.monthLabel || "חודש נוכחי";
    const authentication_otpCode = await waitForProviderAuthentication(page,ctx,'ayalon');
    if (authentication_otpCode.kind === 'authenticated') return;
    const otpCode = authentication_otpCode.code;
    if (!otpCode)
        throw new Error("קוד ה-OTP לא התקבל.");
    await setStatus(runId, {
        status: "running",
        step: "מזריק קוד אימות...",
        monthLabel,
    });
    const code = escJsString(otpCode);
    const debugBefore: any = await page.evaluate(`
    (function() {
      const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
      const normalize = (val) => (val || "").replace(/\\s+/g, " ").trim();

      return {
        url: window.location.href,
        title: document.title,
        text: normalize(document.body.innerText).substring(0, 500),
        inputs: Array.from(document.querySelectorAll('input')).map(i => ({
          id: i.id || "",
          type: i.type || "",
          name: i.name || "",
          className: i.className || "",
          placeholder: i.getAttribute("placeholder") || "",
          alt: i.getAttribute("alt") || "",
          visible: isVisible(i),
          valueLen: (i.value || "").length
        }))
      };
    })()
  `);
    const injection = `
    (function(code) {
      const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;

      const input2Candidates = Array.from(document.querySelectorAll('input#input_2'));
      const input = input2Candidates.find(isVisible);

      const submitCandidates = Array.from(
        document.querySelectorAll('input[type="submit"], .credentials_input_submit')
      );
      const btn = submitCandidates.find(isVisible);

      if (!input) return "NO_VISIBLE_INPUT_2";
      if (!btn) return "NO_VISIBLE_SUBMIT";

      input.value = code;

      ['input', 'change', 'blur'].forEach((ev) => {
        input.dispatchEvent(new Event(ev, { bubbles: true }));
      });

      setTimeout(() => {
        btn.click();
      }, 300);

      return "OTP_SUBMITTED";
    })(${JSON.stringify(code)})
  `;
    const result = await page.evaluate(injection);
    await clearOtp(runId).catch(() => { });
    if (result !== "OTP_SUBMITTED") {
        throw new Error(`הזרקת ה-OTP נכשלה: ${String(result)}`);
    }
}
export async function ayalonHandlePopups(page: Page) {
    const popupSelector = 'div[id^="popup-"].popup-modal.uk-open, div.popup-modal.uk-open';
    const closeBtnSelector = 'button.popup-close-btn[data-popup-id], button.popup-close-btn, button:has-text("סגירה"), button:has-text("סגור")';
    for (let round = 0; round < 6; round++) {
        await page.waitForTimeout(1000);
        const popups = page.locator(popupSelector);
        const popupCount = await popups.count().catch(() => 0);
        if (!popupCount) {
            return;
        }
        let closedAny = false;
        for (let i = 0; i < popupCount; i++) {
            const popup = popups.nth(i);
            const popupId = await popup.getAttribute("id").catch(() => null);
            const popupText = await popup.textContent().catch(() => "");
            const closeBtn = popup.locator(closeBtnSelector).first();
            if (await closeBtn.isVisible().catch(() => false)) {
                try {
                    await closeBtn.click({ force: true, timeout: 5000 });
                }
                catch {
                    await closeBtn.evaluate((el) => {
                        (el as HTMLButtonElement).click();
                    });
                }
                if (popupId) {
                    await page.locator(`#${popupId}`).waitFor({ state: "hidden", timeout: 7000 }).catch(() => { });
                }
                else {
                    await page.waitForTimeout(1500);
                }
                closedAny = true;
            }
        }
        if (!closedAny) {
            break;
        }
    }
    const stillOpen = await page.locator(popupSelector).count().catch(() => 0);
    if (stillOpen > 0) {
        throw new Error("נמצא popup פתוח שלא נסגר.");
    }
}
export async function ayalonDumpCurrentPageElements(page: Page) {
    const aside = page.locator("#aside_container");
    if (await aside.count().catch(() => 0)) {
    }
    const sideMenu = page.locator("nav#side-menu");
    if (await sideMenu.count().catch(() => 0)) {
    }
    const reportLinks = page.locator('a[href*="/reports/"]');
    const reportCount = await reportLinks.count().catch(() => 0);
    for (let i = 0; i < Math.min(reportCount, 5); i++) {
        const link = reportLinks.nth(i);
    }
    const allReportsTitleLinks = page.locator('a[title*="כל הדוחות שלי"]');
    const gaLinks = page.locator('a[data-ga-label*="כל הדוחות שלי"]');
    const searchBox = page.locator("#searchbox");
    if (await searchBox.count().catch(() => 0)) {
    }
    const searchBtn = page.locator("#report-submit-button");
    if (await searchBtn.count().catch(() => 0)) {
    }
}
export async function ayalonDumpFrames(page: Page) {
    const frames = page.frames();
    for (let i = 0; i < frames.length; i++) {
        const fr = frames[i];
        try {
            const asideCount = await fr.locator("#aside_container").count().catch(() => 0);
            const sideMenuCount = await fr.locator("nav#side-menu").count().catch(() => 0);
            const reportsCount = await fr.locator('a[href*="/reports/"]').count().catch(() => 0);
            const searchboxCount = await fr.locator("#searchbox").count().catch(() => 0);
            const searchBtnCount = await fr.locator("#report-submit-button").count().catch(() => 0);
        }
        catch (e: any) {
        }
    }
}
export async function ayalonFindPortalFrame(page: Page) {
    const frames = page.frames();
    for (const fr of frames) {
        try {
            const reportsCount = await fr.locator('a[href*="/reports/"]').count().catch(() => 0);
            const searchboxCount = await fr.locator("#searchbox").count().catch(() => 0);
            const sideMenuCount = await fr.locator("nav#side-menu").count().catch(() => 0);
            if (reportsCount > 0 || searchboxCount > 0 || sideMenuCount > 0) {
                return fr;
            }
        }
        catch {
        }
    }
    return null;
}
export async function ayalonDismissPopupQuick(page: Page) {
    for (let i = 0; i < 3; i++) {
        try {
            await page.keyboard.press("Escape");
            await page.waitForTimeout(800);
            const closeBtn = page
                .locator('button.popup-close-btn[data-popup-id], button.popup-close-btn, button:has-text("סגירה"), button:has-text("סגור")')
                .first();
            if (await closeBtn.count().catch(() => 0)) {
                if (await closeBtn.isVisible().catch(() => false)) {
                    await closeBtn.click({ force: true }).catch(() => { });
                    await page.waitForTimeout(1000);
                }
            }
            const popupCount = await page
                .locator('div[id^="popup-"].popup-modal.uk-open, div.popup-modal.uk-open')
                .count()
                .catch(() => 0);
            if (popupCount === 0) {
                return;
            }
        }
        catch (e: any) {
        }
    }
}
export async function ayalonWaitForDashboardDom(page: Page, timeoutMs = 60000) {
    const started = Date.now();
    let poll = 0;
    while (Date.now() - started < timeoutMs) {
        poll++;
        await page.keyboard.press("Escape").catch(() => { });
        await page.waitForLoadState("domcontentloaded").catch(() => { });
        const asideCount = await page.locator("#aside_container").count().catch(() => 0);
        const sideMenuCount = await page.locator("nav#side-menu").count().catch(() => 0);
        const reportsCount = await page.locator('a[href*="/reports/"]').count().catch(() => 0);
        const reportsTitleCount = await page.locator('a[title*="כל הדוחות שלי"]').count().catch(() => 0);
        const searchboxCount = await page.locator("#searchbox").count().catch(() => 0);
        if (asideCount > 0 ||
            sideMenuCount > 0 ||
            reportsCount > 0 ||
            reportsTitleCount > 0 ||
            searchboxCount > 0) {
            return;
        }
        await page.waitForTimeout(2000);
    }
    throw new Error("הדשבורד לא נטען בזמן - האלמנטים לא זוהו גם אחרי המתנה ארוכה.");
}
export async function ayalonDumpArtifacts(page: Page, outDir: string, tag: string) {
}
export async function ayalonDismissPopupAggressive(page: Page) {
    try {
        await page.locator("body").click({ position: { x: 10, y: 10 }, force: true, timeout: 3000 }).catch(() => { });
        await page.keyboard.press("Escape").catch(() => { });
        await page.waitForTimeout(800);
        const closeByText = page.locator('button:has-text("סגירה"), button:has-text("סגור"), a:has-text("סגירה"), a:has-text("סגור")');
        const count = await closeByText.count().catch(() => 0);
        for (let i = 0; i < Math.min(count, 5); i++) {
            const el = closeByText.nth(i);
            if (await el.isVisible().catch(() => false)) {
                await el.click({ force: true, timeout: 3000 }).catch(() => { });
                await page.waitForTimeout(700);
            }
        }
        await page.evaluate(`
      (function() {
        const sels = [
          '.popup-modal.uk-open',
          'div[id^="popup-"].uk-open',
          '.uk-modal.uk-open',
          '.modal-backdrop',
          '.popup-backdrop'
        ];

        for (const sel of sels) {
          document.querySelectorAll(sel).forEach((el) => {
            try {
              el.classList.remove('uk-open');
              el.setAttribute('aria-hidden', 'true');
              el.style.display = 'none';
              el.style.visibility = 'hidden';
              el.style.pointerEvents = 'none';
            } catch (e) {}
          });
        }
      })()
    `).catch(() => { });
        await page.waitForTimeout(1000);
    }
    catch (e: any) {
    }
}
export async function ayalonNavigateToReport(page: Page) {
    const reportsUrl = "https://portal.ayalon-ins.co.il/f5-w-68747470733a2f2f6167656e7473706f7274616c$$/reports/";
    await page.goto(reportsUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => { });
    await page.waitForTimeout(8000);
    const cdp = await page.context().newCDPSession(page);
    const countResult = await cdp.send("Runtime.evaluate", {
        expression: "document.querySelectorAll('*').length",
        returnByValue: true,
    });
    const fillResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const input = document.querySelector('#searchbox');
      if (!input) return 'NOT_FOUND';
      input.focus();
      input.value = 'נפרעים';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'FILLED: ' + input.value;
    })()`,
        returnByValue: true,
    });
    const clickResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btn = document.querySelector('#report-submit-button');
      if (!btn) return 'BTN_NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(2000);
}
export async function ayalonOpenReportTab(page: Page, context: BrowserContext): Promise<Page> {
    const cdp = await page.context().newCDPSession(page);
    const [newPage] = await Promise.all([
        context.waitForEvent("page", { timeout: 30000 }),
        cdp.send("Runtime.evaluate", {
            expression: `(function() {
        const links = Array.from(document.querySelectorAll('a[title*="נפרעים"]'));
        const report = links.find(a => a.title.includes('סוכן משנה') || a.title.includes('נפרעים'));
        if (!report) return 'NOT_FOUND: ' + links.map(a => a.title).join(' | ');
        report.click();
        return 'CLICKED: ' + report.title;
      })()`,
            returnByValue: true,
        }),
    ]);
    await newPage.bringToFront();
    await newPage.waitForLoadState("domcontentloaded", { timeout: 60000 }).catch(() => { });
    await newPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => { });
    const newCdp = await newPage.context().newCDPSession(newPage);
    for (let i = 0; i < 24; i++) {
        const rows = await newCdp.send("Runtime.evaluate", {
            expression: `document.querySelectorAll('tbody tr, .qv-st-data-row').length`,
            returnByValue: true,
        });
        if (rows.result.value > 0) {
            break;
        }
        await newPage.waitForTimeout(5000);
    }
    return newPage;
}
export async function ayalonFilterDate(page: Page, dateLabel: string) {
}
export async function ayalonExportExcel(page: Page): Promise<import("playwright").Download | null> {
    const cdp = await page.context().newCDPSession(page);
    const getHeaderPos = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const header = document.querySelector('.qlik_table #TpGdMG_title, .qlik_table .qv-object-header');
      if (!header) return null;
      const rect = header.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
    })()`,
        returnByValue: true,
    });
    const headerPos = JSON.parse(getHeaderPos.result.value || 'null');
    if (!headerPos) {
        return null;
    }
    await page.mouse.move(headerPos.x, headerPos.y);
    await page.waitForTimeout(1000);
    const btnPos = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btn = document.querySelector('.qlik_table .export_btn');
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0) return null;
      return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
    })()`,
        returnByValue: true,
    });
    const pos = JSON.parse(btnPos.result.value || 'null');
    if (!pos) {
        return null;
    }
    try {
        const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 60000 }),
            page.mouse.click(pos.x, pos.y),
        ]);
        return download;
    }
    catch (e: any) {
        return null;
    }
}
