// scripts/portalRunner/src/providers/migdal/migdal.shared.ts
import type { Page, Download } from "playwright";
import type { RunnerCtx } from "../../types";

/**
 * פונקציית עזר להמתנה שהלואדר של מגדל ייעלם (Kendo UI)
 */
export async function waitMigdalLoaderGone(page: Page, timeoutMs = 30000) {
  try {
    await page.waitForFunction(() => {
      // בודק את כל סוגי הספינרים הנפוצים במגדל
      const spinners = document.querySelectorAll('.k-loading-mask, .k-loading-image, #messageYesNoDialogSpinner, .modal-backdrop');
      return Array.from(spinners).every(s => (s as HTMLElement).offsetWidth === 0 || (s as HTMLElement).style.display === 'none');
    }, { timeout: timeoutMs });
    console.log("[Migdal] Loader gone ✅");
  } catch (e) {
    console.log("[Migdal] Loader timeout or not found - proceeding");
  }
}

/**
 * לוגין למגדל באמצעות הזרקת קוד (חסין ל-Frames)
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
        // אירועים הכרחיים כדי שהאתר יזהה את ההקלדה
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
 * טיפול בקוד ה-OTP של מגדל
 */
export async function migdalHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, pollOtp, setStatus, clearOtp } = ctx;

  console.log("[Migdal] Waiting for OTP from Magic...");

  const otpCode = await pollOtp(runId);
  if (!otpCode) throw new Error("OTP Timeout: הקוד לא הוקלד במערכת.");

  console.log(`[Migdal] OTP received: ${otpCode}. Injecting into input_2...`);

  await setStatus(runId, { 
    status: "running", 
    step: "קוד התקבל, מזין למערכת מגדל..." 
  });

  const injectionScript = `
    (function(code) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        // שימוש ב-ID המדויק מהתמונה ששלחת
        const input = document.querySelector('#input_2'); 
        const btn = document.querySelector('.credentials_input_submit');

        if (input && btn) {
          clearInterval(interval);
          input.value = code;
          // מגדל צריכה את האירועים האלו כדי להבין שהטקסט השתנה
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          
          console.log("OTP injected, clicking submit...");
          setTimeout(() => btn.click(), 200);
        }
        
        if (attempts > 40) {
          clearInterval(interval);
          console.error("OTP Input not found after 20 seconds");
        }
      }, 500);
    })('${otpCode}')
  `;

  await page.evaluate(injectionScript);

  // ניקוי הקוד
  await clearOtp(runId).catch(() => {});
}


/**
 * פתיחת דוח מתוך דף הדוחות הראשי באמצעות חיפוש
 */
export async function migdalOpenReport(page: Page, reportName: string) {
  console.log(`[Migdal] Opening report: ${reportName}`);
  
  // 1. הזרקת הטקסט לשדה החיפוש ולחיצה על זכוכית המגדלת
  await page.evaluate(`
    (function(name) {
      const input = document.querySelector('input[placeholder*="הקלד"], .src-input-container input');
      const btn = document.querySelector('button.src-btn');
      if (input && btn) {
        input.value = name;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        btn.click();
      }
    })('${reportName}')
  `);

  // 2. המתנה לתוצאה שתופיע ולחיצה עליה
  const itemSelector = `div.rslt-item-param-ttl`;
  await page.waitForFunction((name) => {
    const items = Array.from(document.querySelectorAll('div.rslt-item-param-ttl'));
    return items.some(el => el.textContent && el.textContent.includes(name));
  }, reportName, { timeout: 20000 });

  await page.evaluate((name) => {
    const items = Array.from(document.querySelectorAll('div.rslt-item-param-ttl'));
    const target = items.find(el => el.textContent && el.textContent.includes(name));
    if (target) (target as HTMLElement).click();
  }, reportName);

  await waitMigdalLoaderGone(page);
}

/**
 * יצוא אקסל (Targeted Injection)
 */
export async function migdalExportExcel(page: Page): Promise<Download | null> {
  console.log("[Migdal] Triggering Excel Export...");
  
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    
    const clicked = await page.evaluate(`
      (function() {
        // מחפש את הכפתור לפי ה-ng-click או לפי הטקסט "ייצוא לאקסל"
        const btn = Array.from(document.querySelectorAll('a, button'))
          .find(el => {
            const txt = (el.innerText || "").toLowerCase();
            return (el.getAttribute('ng-click') && el.getAttribute('ng-click').includes('exportToExcel')) || 
                   (txt.includes('אקסל') && !txt.includes('pdf'));
          });
        
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);

    if (!clicked) {
      console.log("[Migdal] Export button not found via injection");
      return null;
    }

    return await downloadPromise;
  } catch (e) {
    console.error("[Migdal] Export timeout or error", e);
    return null;
  }
}

/**
 * פונקציה לוודא שהגענו לדף הבית (NewEra)
 */
export async function migdalEnsureArrived(page: Page) {
  console.log("[Migdal] Verifying arrival at NewEra...");
  await page.waitForURL(/NewEra/i, { timeout: 60000 });
  const dashboardExists = await page.evaluate(() => !!document.querySelector('.home-page, #goToHome, .user-name'));
  if (!dashboardExists) {
    console.log("[Migdal] Dashboard selector not found, but URL is correct.");
  }
}