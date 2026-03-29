import type { Page, Download } from "playwright";
import type { RunnerCtx } from "../../types";

/**
 * פונקציית עזר להמתנה שהלואדר של מגדל ייעלם (Kendo UI)
 */
export async function waitMigdalLoaderGone(page: Page, timeoutMs = 30000) {
  try {
    await page.waitForFunction(() => {
      const spinners = document.querySelectorAll('.k-loading-mask, .k-loading-image, #messageYesNoDialogSpinner, .modal-backdrop, .loading-backdrop');
      return Array.from(spinners).every(s => (s as any).offsetWidth === 0 || (s as any).style.display === 'none');
    }, { timeout: timeoutMs });
    console.log("[Migdal] Loader gone ✅");
  } catch (e) {
    console.log("[Migdal] Loader timeout or not found - proceeding");
  }
}

/**
 * לוגין למגדל - עובד, לא נגעתי
 */
export async function migdalLogin(page: Page, username: string, password: string) {
  console.log("[Migdal] Injecting login credentials...");
  const injection = `
    (function(u, p) {
      const user = document.querySelector('#input_1');
      const pass = document.querySelector('#input_2');
      const btn = document.querySelector('input.credentials_input_submit');
      if (user && pass && btn) {
        user.value = u;
        pass.value = p;
        user.dispatchEvent(new Event('input', { bubbles: true }));
        pass.dispatchEvent(new Event('input', { bubbles: true }));
        pass.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(() => btn.click(), 200);
        return "SUCCESS";
      }
      return "FIELDS_NOT_FOUND";
    })('${username}', '${password}')
  `;
  const result = await page.evaluate(injection).catch(e => "ERROR: " + e.message);
  console.log(`[Migdal] Login result: ${result}`);
}

/**
 * OTP - עובד, לא נגעתי
 */
export async function migdalHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, pollOtp, setStatus, clearOtp } = ctx;
  console.log("[Migdal] Waiting for OTP from Magic...");
  const otpCode = await pollOtp(runId);
  if (!otpCode) throw new Error("OTP Timeout: הקוד לא הוקלד במערכת.");
  console.log(`[Migdal] OTP received: ${otpCode}. Injecting into input_2...`);

  await setStatus(runId, { status: "running", step: "קוד התקבל, מזין למערכת מגדל..." });

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
  await page.evaluate(injectionScript);
  await clearOtp(runId).catch(() => {});
}

/**
 * ניווט - עובד, לא נגעתי
 */
export async function navigateToCommissions(page: Page) {
  console.log("[Migdal] Starting atomic navigation to Commissions...");

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
          console.log("Submenu didn't open, clicking 'tools' again...");
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

  const result = await page.evaluate(script);
  console.log(`[Migdal] Navigation result: ${result}`);

  if (String(result) !== "SUCCESS") {
    throw new Error(String(result));
  }

  await waitMigdalLoaderGone(page);
}
/**
 * פתיחת דוח באמצעות קליק ישיר על השם שלו - ללא שגיאות TS וללא בעיות Serialization
 */
export async function migdalOpenReport(page: Page, reportName: string) {
  console.log(`[Migdal] Step: Searching for report "${reportName}"...`);

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
  console.log(`[Migdal] Find & Click result for "${reportName}": ${result}`);

  await waitMigdalLoaderGone(page);
  
  // השארתי 15 שניות כדי לוודא שאת רואה שהדוח אכן נפתח
  console.log("[Migdal] PAUSE: Observing for 15s...");
  await page.waitForTimeout(15000); 
}


export async function migdalReturnToAgreements(page: Page) {
  console.log("[Migdal] Returning to Agreements menu via side-bar...");

  // שלב 1: לחיצה על דוחות
  await page.evaluate(`
    (function() {
      const el = Array.from(document.querySelectorAll('span.item-label'))
        .find(e => (e.textContent || "").includes('דוחות') && e.offsetWidth > 0);
      if (el) el.click();
    })()
  `).catch(() => {});

  await page.waitForTimeout(2000);

  // שלב 2: לחיצה על הסכמים ועמלות
  await page.evaluate(`
    (function() {
      const el = Array.from(document.querySelectorAll('label.s-content'))
        .find(e => (e.textContent || "").includes('הסכמים ועמלות') && e.offsetWidth > 0);
      if (el) el.click();
    })()
  `).catch(() => {});

  // שלב 3: המתן שהדף יתייצב
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await waitMigdalLoaderGone(page);

  // שלב 4: בדוק אם הצלחנו
  const isSelected = await page.evaluate(`
    (function() {
      const label = Array.from(document.querySelectorAll('label.s-content'))
        .find(e => (e.textContent || "").includes('הסכמים ועמלות'));
      const parent = label?.closest('div.category');
      return !!(parent && parent.classList.contains('selected'));
    })()
  `).catch(() => false);

  if (!isSelected) {
    console.warn("[Migdal] Falling back to direct navigation...");
    await page.goto(
      "https://apmaccess.migdal.co.il/NewEra/reports-lobby",
      { waitUntil: "networkidle" }
    ).catch(() => {});
    await page.waitForTimeout(3000);
    await page.evaluate(`
      (function() {
        const label = Array.from(document.querySelectorAll('label.s-content'))
          .find(e => (e.textContent || "").includes('הסכמים ועמלות'));
        if (label) label.click();
      })()
    `).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await waitMigdalLoaderGone(page);
  }

  console.log("[Migdal] Back to Agreements ✅");
}

/**
 * יצוא אקסל - עובד, לא נגעתי
 */
export async function migdalExportExcel(page: Page): Promise<Download | null> {
  console.log("[Migdal] Triggering Excel Export...");
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
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
    if (!clicked) return null;
    return await downloadPromise;
  } catch (e) {
    return null;
  }
}

/**
 * פונקציה לסגירת הודעות קופצות (Modals) במגדל
 */
export async function migdalClearModals(page: Page) {
  console.log("[Migdal] Checking for annoying pop-ups...");
  
  const script = `
    (async function() {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      
      // 1. חיפוש כפתור ה-X (סגירה) בפינה
      // במגדל זה בדרך כלל בתוך MuiDialog או אלמנט עם 'close'
      const closeBtn = document.querySelector('button[aria-label="close"], .MuiDialog-container button:first-child, svg[data-testid="CloseIcon"]');
      if (closeBtn) {
        console.log("Migdal: Found 'X' button, closing modal...");
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
        console.log("Migdal: Found action button, clicking to clear...");
        targetBtn.click();
        await wait(1000);
        return "CLOSED_VIA_BUTTON";
      }

      return "NO_MODAL_FOUND";
    })()
  `;

  try {
    const result = await page.evaluate(script);
    console.log(`[Migdal] Modal clearer result: ${result}`);
  } catch (e) {
    // מתעלמים משגיאות כאן - אם אין מודאל, הכל טוב
  }
}