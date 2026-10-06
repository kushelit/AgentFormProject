import { providerAuthenticated, waitForProviderAuthentication, continueIfAuthenticated } from '../../auth-providers';
// Ported from the native provider; browser report keys replace local files.
import type { Page, Download } from "../../browser";
import type { RunnerCtx } from "../../types";
export async function migdalHasCredentialsError(page: Page): Promise<boolean> {
    try {
        const result = await page.evaluate(`
      (function() {
        const cell = document.getElementById('credentials_table_postheader');
        if (!cell) return false;
        const txt = (cell.innerText || cell.textContent || '').trim();
        return txt.includes('הזיהוי נכשל');
      })()
    `);
        return result === true;
    }
    catch (e: any) {
        if (String(e?.message || '').includes('Execution context was destroyed')) {
            return false;
        }
        throw e;
    }
}
export async function waitMigdalLoaderGone(page: Page, timeoutMs = 30000) {
    try {
        await page.waitForFunction(() => {
            const spinners = document.querySelectorAll('.k-loading-mask, .k-loading-image, #messageYesNoDialogSpinner, .modal-backdrop, .loading-backdrop');
            return Array.from(spinners).every(s => (s as any).offsetWidth === 0 || (s as any).style.display === 'none');
        }, { timeout: timeoutMs });
    }
    catch (e) {
    }
}
export async function migdalLogin(page: Page, username: string, password: string) {
    if (await providerAuthenticated(page,'migdal')) return;
    let restartClicked = false;
    let readyDeadline = Date.now()+30000;
    while (true) {
        if (await providerAuthenticated(page,'migdal')) return;
        const state = await page.evaluate(() => {
            const visible = (el: Element) => !!el.getClientRects().length;
            const user = document.querySelector('#input_1'), pass = document.querySelector('#input_2');
            if (user && pass && visible(user) && visible(pass)) return {kind:'LOGIN_READY'};
            const expired = document.body.innerText.includes('חיבורך הסתיים') || document.body.innerText.includes('גישה נדחתה');
            if (expired) {
                const link = Array.from(document.querySelectorAll('a,button')).find(el=>
                    visible(el) && (el.textContent || '').trim()==='לחץ כאן');
                if (link) {
                    link.scrollIntoView({block:'center'});
                    const rect = link.getBoundingClientRect();
                    return {kind:'RESTART_READY',x:rect.left+rect.width/2,y:rect.top+rect.height/2};
                }
            }
            return {kind:'WAITING'};
        }).catch(()=> ({kind:'WAITING'}));
        if (state.kind === 'LOGIN_READY') break;
        if (state.kind === 'RESTART_READY' && !restartClicked) {
            restartClicked = true;
            await page.mouse.click(state.x!,state.y!);
            readyDeadline = Date.now()+60000;
        }
        if (Date.now()>=readyDeadline) throw new Error(restartClicked ? 'MIGDAL_LOGIN_RESTART_FAILED' : 'MIGDAL_LOGIN_FIELDS_NOT_FOUND');
        await page.waitForTimeout(1000);
    }
    const injection = `
    (function(u, p) {
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const user = document.querySelector('#input_1');
          const pass = document.querySelector('#input_2');
          const btn = document.querySelector('input.credentials_input_submit');
          if (user && pass && btn) {
            clearInterval(interval);
            user.value = u;
            pass.value = p;
            user.dispatchEvent(new Event('input', { bubbles: true }));
            pass.dispatchEvent(new Event('input', { bubbles: true }));
            pass.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(() => btn.click(), 200);
            resolve("SUCCESS");
          }
          if (attempts > 60) {
            clearInterval(interval);
            resolve("FIELDS_NOT_FOUND");
          }
        }, 500);
      });
    })(${JSON.stringify(username)}, ${JSON.stringify(password)})
  `;
    const result = await page.evaluate(injection);
    if (result !== 'SUCCESS') throw new Error('MIGDAL_LOGIN_SUBMIT_FAILED');
    const start = Date.now();
    let hasError = false;
    while (Date.now() - start < 10000) {
        try {
            hasError = await migdalHasCredentialsError(page);
            if (hasError)
                break;
            const movedOn = await page.evaluate(`!document.querySelector('#input_1')`);
            if (movedOn)
                break;
        }
        catch (e) {
        }
        await page.waitForTimeout(500).catch(() => { });
    }
    if (hasError) {
        throw new Error('מגדל: פרטי ההתחברות (ת.ז/סיסמה) שגויים - הפורטל הציג "הזיהוי נכשל, נסה שנית"');
    }
}
async function injectMigdalOtp(page: Page, otpCode: string) {
    const injectionScript = `
    (function(code) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const input = document.querySelector('#input_2'); 
        const btn = document.querySelector('.credentials_input_submit');
        if (input && btn) {
          clearInterval(interval);
          input.value = code;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          setTimeout(() => btn.click(), 200);
        }
        if (attempts > 40) clearInterval(interval);
      }, 500);
    })('${otpCode}')
  `;
    await page.evaluate(injectionScript).catch((e: any) => {
        if (!String(e?.message || '').includes('Execution context was destroyed')) {
            throw e;
        }
    });
}
async function waitForMigdalOtpDone(page: Page, timeoutMs = 15000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const ready = await page.evaluate(`
        !!document.getElementById('goToHome') || !document.querySelector('#input_2')
      `);
            if (ready)
                return true;
        }
        catch (e) {
        }
        await page.waitForTimeout(500).catch(() => { });
    }
    return false;
}
export async function migdalHandleOtp(page: Page, ctx: RunnerCtx) {
    if (await continueIfAuthenticated(page,ctx,'migdal')) return;
    const { runId, pollOtp, setStatus, clearOtp } = ctx;
    const screenDeadline = Date.now()+30000;
    while (true) {
        if (await continueIfAuthenticated(page,ctx,'migdal')) return;
        const screen = await page.evaluate(() => {
            if (document.body.innerText.includes('חיבורך הסתיים') || document.body.innerText.includes('גישה נדחתה')) return 'EXPIRED';
            const otp = document.querySelector('#input_2');
            return otp?.getClientRects().length && !document.querySelector('#input_1')?.getClientRects().length ? 'OTP_READY' : 'WAITING';
        }).catch(()=> 'WAITING');
        if (screen === 'OTP_READY') break;
        if (screen === 'EXPIRED') throw new Error('MIGDAL_SESSION_EXPIRED');
        if (Date.now()>=screenDeadline) throw new Error('MIGDAL_OTP_SCREEN_NOT_REACHED');
        await page.waitForTimeout(500);
    }
    await setStatus(runId,{status:'otp_required',step:'ממתין לקוד אימות ממגדל',
        'otp.mode':'firestore','otp.state':'required','otp.value':''});
    let authentication_otpCode = await waitForProviderAuthentication(page,ctx,'migdal');
    if (authentication_otpCode.kind === 'authenticated') return;
    let otpCode = authentication_otpCode.code;
    if (!otpCode)
        throw new Error("OTP Timeout: הקוד לא הוקלד במערכת.");
    await setStatus(runId, { status: "running", step: "קוד התקבל, מזין למערכת מגדל..." });
    await injectMigdalOtp(page, otpCode);
    await clearOtp(runId).catch(() => { });
    await waitForMigdalOtpDone(page, 15000);
    const hasError = await migdalHasCredentialsError(page);
    if (hasError) {
        await setStatus(runId, {
            status: "otp_required",
            step: "הקוד הקודם היה שגוי - נסה שוב",
            "otp.mode": "firestore"
        });
        authentication_otpCode = await waitForProviderAuthentication(page,ctx,'migdal');
        if (authentication_otpCode.kind === 'authenticated') return;
        otpCode = authentication_otpCode.code;
        if (!otpCode)
            throw new Error("OTP Timeout (ניסיון שני)");
        await setStatus(runId, { status: "running", step: "קוד התקבל, מזין למערכת מגדל..." });
        await injectMigdalOtp(page, otpCode);
        await clearOtp(runId).catch(() => { });
        await waitForMigdalOtpDone(page, 15000);
        const stillError = await migdalHasCredentialsError(page);
        if (stillError) {
            throw new Error('מגדל: קוד הזיהוי שגוי גם בניסיון השני - הפורטל הציג "הזיהוי נכשל, נסה שנית"');
        }
    }
}
export async function navigateToCommissions(page: Page) {
    const script = `
    (async function() {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      
      const getByText = (selector, text) => {
        return Array.from(document.querySelectorAll(selector))
          .find(el => (el.innerText || el.textContent || "").includes(text));
      };

      // 1. לופ המתנה ל"כלים" - עד 10 שניות
      let tools = null;
      for (let i = 0; i < 10; i++) {
        tools = getByText('label, span, .item-label', 'כלים');
        // בודקים שהאלמנט לא רק קיים אלא גם גלוי
        if (tools && tools.offsetHeight > 0) break; 
        await wait(1000);
      }

      if (!tools) return "TOOLS_NOT_FOUND_AFTER_RETRY";
      
      // 2. לחיצה וניסיון פתיחת תפריט משנה
      tools.click();
      await wait(1500);

      let reportBtn = document.getElementById('goToSubCategory');
      if (!reportBtn) {
          // console.log("Submenu didn't open, clicking 'tools' again...");
          tools.click(); // לחיצה נוספת לביטחון
          await wait(2000);
          reportBtn = document.getElementById('goToSubCategory');
      }

      if (!reportBtn) return "SUBMENU_FAILED_TO_OPEN";
      reportBtn.click();
      await wait(2000);

      // 3. לחיצה על "הסכמים ועמלות" עם המתנה קלה
      let target = null;
      for (let i = 0; i < 5; i++) {
        target = getByText('label.s-content, span', 'הסכמים ועמלות');
        if (target) break;
        await wait(1000);
      }
      
      if (!target) return "AGREEMENTS_LINK_NOT_FOUND";
      
      target.click();
      return "SUCCESS";
    })()
  `;
    const result = await page.evaluate(script).catch((e: any) => {
        if (String(e.message || "").includes("Execution context was destroyed")) {
            return "NAVIGATION_OCCURRED";
        }
        throw e;
    });
    if (String(result) !== "SUCCESS" && String(result) !== "NAVIGATION_OCCURRED") {
        throw new Error(String(result));
    }
    await waitMigdalLoaderGone(page);
}
export async function migdalOpenReport(page: Page, reportName: string) {
    const injection = `
    (function(name) {
      // מחפש בכל הסוגים שראינו בתמונות שלך (גם div וגם label)
      const selectors = 'label.title, div.rslt-item-param-ttl, .title, .item-label';
      const items = Array.from(document.querySelectorAll(selectors));
      
      const target = items.find(el => {
        // הופך את כל הניו-ליינים והרווחים הכפולים לרווח אחד רגיל
        const cleanText = (el.textContent || "").replace(/\\s+/g, ' ').trim();
        const cleanSearchName = name.replace(/\\s+/g, ' ').trim();
        
        return cleanText.includes(cleanSearchName);
      });
      
      if (target) {
        target.scrollIntoView({ block: "center" });
        target.click();
        return "CLICKED";
      }
      
      // אם לא מצא, נחזיר לוג של מה שכן קיים על המסך כדי שנדע מה הטקסט המדויק
      return "NOT_FOUND. Available on page: " + items.map(i => i.textContent.trim()).join(' | ');
    })('${reportName}')
  `;
    const result = await page.evaluate(injection);
    await waitMigdalLoaderGone(page);
    await page.waitForTimeout(15000);
}
export async function migdalReturnToAgreements(page: Page) {
    await page.evaluate(`
    (function() {
      const el = Array.from(document.querySelectorAll('span.item-label'))
        .find(e => (e.textContent || "").includes('דוחות') && e.offsetWidth > 0);
      if (el) el.click();
    })()
  `).catch(() => { });
    await page.waitForTimeout(2000);
    await page.evaluate(`
    (function() {
      const el = Array.from(document.querySelectorAll('label.s-content'))
        .find(e => (e.textContent || "").includes('הסכמים ועמלות') && e.offsetWidth > 0);
      if (el) el.click();
    })()
  `).catch(() => { });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => { });
    await page.waitForTimeout(2000);
    await waitMigdalLoaderGone(page);
    const isSelected = await page.evaluate(`
    (function() {
      const label = Array.from(document.querySelectorAll('label.s-content'))
        .find(e => (e.textContent || "").includes('הסכמים ועמלות'));
      const parent = label?.closest('div.category');
      return !!(parent && parent.classList.contains('selected'));
    })()
  `).catch(() => false);
    if (!isSelected) {
        await page.goto("https://apmaccess.migdal.co.il/NewEra/reports-lobby", { waitUntil: "networkidle" }).catch(() => { });
        await page.waitForTimeout(3000);
        await page.evaluate(`
      (function() {
        const label = Array.from(document.querySelectorAll('label.s-content'))
          .find(e => (e.textContent || "").includes('הסכמים ועמלות'));
        if (label) label.click();
      })()
    `).catch(() => { });
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => { });
        await page.waitForTimeout(2000);
        await waitMigdalLoaderGone(page);
    }
}
export async function migdalExportExcel(page: Page): Promise<Download | null> {
    try {
        const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
        // Observe the waiter even if evaluating/clicking the export control fails.
        void downloadPromise.catch(() => {});
        const clicked = await page.evaluate(`
      (function() {
        const btn = Array.from(document.querySelectorAll('a, button, span.item-label'))
          .find(el => {
            const txt = (el.innerText || "").toLowerCase();
            return (el.getAttribute('ng-click') && el.getAttribute('ng-click').includes('exportToExcel')) || 
                   (txt.includes('אקסל') && !txt.includes('pdf'));
          });
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
        if (!clicked)
            throw new Error('MIGDAL_EXPORT_BUTTON_NOT_FOUND');
        return await downloadPromise;
    }
    catch (e: any) {
        if (/^[A-Z_0-9]+$/.test(String(e?.message || ''))) throw e;
        throw new Error('MIGDAL_EXPORT_FAILED');
    }
}
export async function migdalClearModals(page: Page) {
    const script = `
    (async function() {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      
      // 1. חיפוש כפתור ה-X (סגירה) בפינה
      // במגדל זה בדרך כלל בתוך MuiDialog או אלמנט עם 'close'
      const closeBtn = document.querySelector('button[aria-label="close"], .MuiDialog-container button:first-child, svg[data-testid="CloseIcon"]');
      if (closeBtn) {
        // console.log("Migdal: Found 'X' button, closing modal...");
        closeBtn.closest('button')?.click() || closeBtn.click();
        await wait(1000);
        return "CLOSED_X";
      }

      // 2. חיפוש כפתור ה"אישור" או "לפרטים נוספים" (כמו בתמונה ששלחת)
      const actionButtons = Array.from(document.querySelectorAll('button, .MuiButton-root'));
      const targetBtn = actionButtons.find(btn => {
        const txt = (btn.textContent || "").trim();
        return txt.includes('לפרטים נוספים') || txt.includes('הבנתי') || txt.includes('סגור');
      });

      if (targetBtn) {
        // console.log("Migdal: Found action button, clicking to clear...");
        targetBtn.click();
        await wait(1000);
        return "CLOSED_VIA_BUTTON";
      }

      return "NO_MODAL_FOUND";
    })()
  `;
    try {
        const result = await page.evaluate(script);
    }
    catch (e) {
    }
}
