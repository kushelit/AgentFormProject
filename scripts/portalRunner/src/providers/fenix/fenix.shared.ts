import type { Page, Download, BrowserContext } from "playwright";
import type { RunnerCtx } from "../../types";

/**
 * המתנה שהלואדר ייעלם
 */
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
  } catch (e) {
    console.log("[Phoenix] Loader timeout - continuing");
  }
}

/**
 * פונקציה חדשה: סגירת הפופ-אפ שחוסם את המסך (זה בסדר / חסימה)
 */
async function closeInitialModals(page: Page) {
  console.log("[Phoenix] Checking for blocking modals...");
  try {
    // לחיצה על "זה בסדר" (או כפתור אישור דומה בפופ-אפ)
    const approveBtn = page.locator('button:has-text("זה בסדר"), button:has-text("אישור")').first();
    if (await approveBtn.isVisible({ timeout: 5000 })) {
      console.log("[Phoenix] Closing modal: Clicking 'זה בסדר'");
      await approveBtn.click({ force: true });
      await page.waitForTimeout(2000);
    }
    
    // סגירת פופ-אפ נוסף עם X אם קיים (לפי image_b608ee יש X קטן למעלה)
    const xBtn = page.locator('button .icon-close, .modal-close, [aria-label="Close"]').first();
    if (await xBtn.isVisible({ timeout: 2000 })) {
        await xBtn.click({ force: true });
    }
  } catch (e) {
    console.log("[Phoenix] No modals found or could not close them - moving on.");
  }
}

export async function handleFenixLoginRedirect(page: Page) {
  const url = page.url();
  if (url.includes("errorcode=19") || url.includes("logout")) {
    try {
      const returnBtn = page.getByText("חזרה למסך כניסה").first();
      await returnBtn.waitFor({ state: "visible", timeout: 8000 });
      await returnBtn.click({ force: true });
      await page.waitForURL("**/my.policy", { timeout: 20000 }).catch(() => {});
    } catch (e) {
      await page.goto("https://agent.fnx.co.il/my.policy", { waitUntil: "domcontentloaded" });
    }
  }
}

export async function phoenixLogin(page: Page, username: string, password: string) {
  console.log("[Fenix] Injecting login...");
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
  await page.evaluate(injection);
  await page.waitForTimeout(8000);
}

export async function phoenixHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp } = ctx;
  await setStatus(runId, { status: "otp_required", step: "ממתין לקוד זיהוי", "otp.mode": "firestore" });
  const otpCode = await pollOtp(runId);
  if (!otpCode) throw new Error("OTP Timeout");

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
  await page.evaluate(injection);
  await page.waitForTimeout(8000);
  await clearOtp(runId).catch(() => {});
}


/**
 * ניווט לדף עמלות: דוחות -> עמלות
 * התיקון: שימוש במחרוזות (Strings) למניעת שגיאת Serialization ב-EXE
 */
export async function navigateToPhoenixCommissions(page: Page) {
  console.log("[Phoenix] Navigating to Commissions (Strict Mode)...");

  await waitPhoenixLoaderGone(page, 30000);
  await page.waitForTimeout(4000);

  // שלב א': לחיצה על "דוחות"
  const reportsResult = await page.evaluate<string>(`
    (function() {
      const els = Array.from(document.querySelectorAll('button, a, .menu-item, span'));
      const btn = els.find(el => el.innerText?.trim() === 'דוחות' || el.getAttribute('aria-label')?.includes('דוחות'));
      if (btn) {
        const clickable = btn.closest('button') || btn.closest('a') || btn;
        clickable.click();
        return "CLICKED";
      }
      return "NOT_FOUND";
    })()
  `);
  
  console.log("[Phoenix] Reports button click:", reportsResult);
  await page.waitForTimeout(3000);
  await waitPhoenixLoaderGone(page, 20000);

  // שלב ב': לחיצה על "עמלות" (לפי ה-aria-label מהתמונה)
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

  console.log("[Phoenix] Commissions button result:", commsResult);
  
  if (commsResult.startsWith("ERROR")) {
    throw new Error("לא נמצא כפתור עמלות בתפריט הדוחות");
  }

  // שלב ג': המתנה קריטית לטעינת דף העמלות (חיפוש טקסט שקיים רק שם)
  console.log("[Phoenix] Waiting for commissions page content...");
  await page.waitForFunction(() => {
    return document.body.innerText.includes('עמלות נפרעים') || 
           document.body.innerText.includes('חיפוש') ||
           !!document.querySelector('fnx-nx-client-continuous-table-export-to-excel');
  }, { timeout: 45000 }).catch(() => {
    console.warn("[Phoenix] Page content timeout, but continuing...");
  });
}

/**
 * פתיחת דוח בטאב חדש
 */
/**
 * פותח דוח – תומך גם בטאב חדש וגם באותו טאב
 */


export async function phoenixOpenReport(mainPage: Page, reportName: string): Promise<Page> {
  console.log(`[Phoenix] Opening report "${reportName}"...`);

  const context = mainPage.context();
  // נתחיל להאזין לפתיחת דף חדש לפני הלחיצה
  const pagePromise = context.waitForEvent('page', { timeout: 30000 }).catch(() => null);

  // הזרקת המשתנה כטקסט נקי כדי לעקוף בעיות Serialization ב-EXE
  // השתמשתי ב-JSON.stringify כדי לטפל בגרשיים בתוך שם הדוח אם יש כאלו
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
  console.log(`[Phoenix] Open report click result: ${res}`);

  if (res === "NOT_FOUND") {
    throw new Error(`הדוח "${reportName}" לא נמצא בדף העמלות`);
  }

  // מחכים לראות אם נפתח טאב חדש (כפי שקורה בדרך כלל בפניקס)
  const newPage = await pagePromise;
  
  if (newPage) {
    console.log("[Phoenix] New tab detected for the report.");
    await newPage.waitForLoadState("load");
    // חשוב לוודא שהלואדר בדף החדש נעלם לפני שממשיכים
    await waitPhoenixLoaderGone(newPage, 30000);
    return newPage;
  }

  console.log("[Phoenix] No new tab detected, continuing with current page.");
  return mainPage;
}


/**
 * הורדת אקסל (האייקון מהתמונה)
 */
export async function phoenixExportExcel(page: Page): Promise<Download | null> {
  console.log("[Phoenix] Triggering Excel Export...");
  
  try {
    await waitPhoenixLoaderGone(page, 45000);
    await page.waitForTimeout(5000);

    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });

    const clicked = await page.evaluate<string>(`
      (function() {
        // חיפוש לפי הקומפוננטה הייחודית לפניקס
        const container = document.querySelector('fnx-nx-client-continuous-table-export-to-excel');
        const img = container ? container.querySelector('img') : document.querySelector('img[src*="excel"]');
        
        if (img) {
          img.click();
          return "CLICKED";
        }
        return "NOT_FOUND";
      })()
    `);

    if (clicked === "NOT_FOUND") {
      console.error("[Phoenix] Excel export icon not found in DOM");
      return null;
    }

    return await downloadPromise;
  } catch (e) {
    console.error("[Phoenix] Export failed:", e);
    return null;
  }
}