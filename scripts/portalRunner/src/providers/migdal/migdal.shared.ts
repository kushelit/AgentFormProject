// scripts/portalRunner/src/providers/migdal/migdal.shared.ts
import type { Page, Download } from "playwright";
import type { RunnerCtx } from "../../types";

/**
 * פונקציית עזר להמתנה שהלואדר של מגדל ייעלם (Kendo UI)
 */
export async function waitMigdalLoaderGone(page: Page, timeoutMs = 30000) {
  try {
    await page.waitForFunction(() => {
      const spinners = document.querySelectorAll('.k-loading-mask, .k-loading-image, #messageYesNoDialogSpinner, .modal-backdrop, .loading-backdrop');
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
 * ניווט לדף עמלות: כלים -> דוחות -> הסכמים ועמלות
 */
export async function navigateToCommissions(page: Page) {
  console.log("[Migdal] Navigating to commissions page...");
  const injection = `
    (function() {
      const getByText = (selector, text) => {
        return Array.from(document.querySelectorAll(selector))
          .find(el => el.innerText && el.innerText.includes(text));
      };

      // 1. לחיצה על כלים
      const tools = getByText('label', 'כלים');
      if (tools) tools.click();

      // 2. לחיצה על דוחות (אחרי שניה)
      setTimeout(() => {
        const reportBtn = document.getElementById('goToSubCategory');
        if (reportBtn) reportBtn.click();
      }, 1000);

      // 3. לחיצה על הסכמים ועמלות (אחרי 2 שניות)
      setTimeout(() => {
        const target = getByText('label.s-content', 'הסכמים ועמלות');
        if (target) target.click();
      }, 2000);
    })()
  `;
  await page.evaluate(injection);
  await page.waitForTimeout(4500); // המתנה לסיום כל הקליקים
  await waitMigdalLoaderGone(page);
}

/**
 * פתיחת דוח מתוך דף הדוחות הראשי באמצעות חיפוש
 */
export async function migdalOpenReport(page: Page, reportName: string) {
  console.log(`[Migdal] Opening report: ${reportName}`);
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

  await page.waitForFunction((name) => {
    const items = Array.from(document.querySelectorAll('div.rslt-item-param-ttl'));
    return items.some(el => el.textContent && el.textContent.includes(name));
  }, reportName, { timeout: 20000 });

  await page.evaluate((name) => {
    const items = Array.from(document.querySelectorAll('div.rslt-item-param-ttl'));
    const target = items.find(el => el.textContent && el.textContent.includes(name));
    if (target) (target as any).click();
  }, reportName);

  await waitMigdalLoaderGone(page);
  await page.waitForTimeout(3000); // המתנה לטעינת הגריד
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