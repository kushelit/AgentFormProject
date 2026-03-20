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
 * ניווט: דוחות -> עמלות
 */
/**
 * ניווט לדף עמלות: דוחות -> עמלות
 * שימוש ב-JS Injection כדי לעקוף פופ-אפים שחוסמים את הלחיצה
 */
/**
 * ניווט לדף עמלות: דוחות -> עמלות
 * התיקון: שימוש במחרוזות (Strings) למניעת שגיאת Serialization ב-EXE
 */
export async function navigateToPhoenixCommissions(page: Page) {
  console.log("[Phoenix] Navigating to Commissions (Direct JS String Mode)...");
  
  await page.waitForLoadState("domcontentloaded");
  await waitPhoenixLoaderGone(page, 45000);
  await page.waitForTimeout(8000); // זמן להתנדפות מסכי F5

  // לחיצה על "דוחות" - הזרקת קוד כטקסט פשוט
  await page.evaluate(`
    (function() {
      const el = Array.from(document.querySelectorAll('span, a')).find(e => e.textContent.trim() === 'דוחות');
      if (el) el.click();
    })()
  `);
  
  await page.waitForTimeout(3000);

  // לחיצה על "עמלות" - הזרקת קוד כטקסט פשוט
  await page.evaluate(`
    (function() {
      const el = Array.from(document.querySelectorAll('span, a')).find(e => e.textContent.trim() === 'עמלות');
      if (el) el.click();
    })()
  `);

  await waitPhoenixLoaderGone(page);
}

/**
 * פתיחת דוח בטאב חדש
 */
export async function phoenixOpenReport(page: Page, context: BrowserContext, reportName: string): Promise<Page> {
  console.log(`[Phoenix] Opening "${reportName}"...`);
  const pagePromise = context.waitForEvent('page');

  // הזרקת שם הדוח ישירות לתוך ה-Script כטקסט
  const clickScript = `
    (function() {
      const name = "${reportName}";
      const el = Array.from(document.querySelectorAll('span, a')).find(e => e.textContent.trim().includes(name));
      if (el) el.click();
    })()
  `;
  await page.evaluate(clickScript);

  const newPage = await pagePromise;
  await newPage.waitForLoadState("load");
  return newPage;
}

/**
 * הורדת אקסל (האייקון מהתמונה)
 */
export async function phoenixExportExcel(reportPage: Page): Promise<Download | null> {
  try {
    await waitPhoenixLoaderGone(reportPage);
    const downloadPromise = reportPage.waitForEvent("download", { timeout: 60000 });

    // לחיצה על האייקון באמצעות הזרקת טקסט
    await reportPage.evaluate(`
      (function() {
        const img = document.querySelector('img[src*="excel.svg"]');
        if (img) img.click();
      })()
    `);
    
    return await downloadPromise;
  } catch (e) {
    console.log("[Phoenix] Export failed:", e);
    return null;
  }
}