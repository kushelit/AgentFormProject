import type { Page, Download } from "playwright";
import type { RunnerCtx } from "../../types";

/**
 * המתנה שהלואדר ייעלם - שימוש במחרוזת טקסט למניעת שגיאות EXE
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
 * מטפל במסך שגיאה/לוגאוט
 */
export async function handleFenixLoginRedirect(page: Page) {
  const url = page.url();
  if (url.includes("errorcode=19") || url.includes("logout")) {
    console.log("[Phoenix] Detected error/logout page. Trying return button...");
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

/**
 * לוגין - הקלדה אנושית רציפה לעקיפת חסימות
 */
export async function phoenixLogin(page: Page, username: string, password: string) {
  console.log("[Fenix] Injecting login (String style - Clal proven)...");

  const injection = `
    (function(u, p) {
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
          return "SUCCESS";
        }
        if (attempts > 80) { clearInterval(interval); return "TIMEOUT"; }
      }, 500);
    })('${username}', '${password}')
  `;

  const result = await page.evaluate(injection);
  console.log(`[Fenix Login] Result: ${result}`);
  await page.waitForTimeout(7000);   // חשוב!
}

export async function phoenixHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp } = ctx;

  await setStatus(runId, { 
    status: "otp_required", 
    step: "ממתין לקוד זיהוי מהפניקס", 
    "otp.mode": "firestore" 
  });

  const otpCode = await pollOtp(runId);
  if (!otpCode) throw new Error("OTP Timeout");

  await setStatus(runId, { status: "running", step: "מזין OTP..." });

  const injection = `
    (function(code) {
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
          return "SUCCESS";
        }
        if (attempts > 40) clearInterval(interval);
      }, 500);
    })('${otpCode}')
  `;

  await page.evaluate(injection);
  await page.waitForTimeout(6000);
  await clearOtp(runId).catch(() => {});
}

/**
 * ניווט לדף עמלות
 */
export async function navigateToPhoenixCommissions(page: Page) {
  console.log("[Phoenix] Navigating to commissions area...");
  await waitPhoenixLoaderGone(page);
  
  await page.getByText("עמלות", { exact: false }).first().click({ force: true });
  await page.waitForTimeout(2000);
  await page.getByText("דוחות עמלות", { exact: false }).first().click({ force: true });

  await waitPhoenixLoaderGone(page);
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
}

export async function phoenixOpenReport(page: Page, reportName: string) {
  const reportLink = page.getByText(reportName, { exact: false }).first();
  await reportLink.waitFor({ state: "visible", timeout: 30000 });
  await reportLink.click({ force: true });
  await waitPhoenixLoaderGone(page);
}

export async function phoenixExportExcel(page: Page): Promise<Download | null> {
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    const excelBtn = page.locator('[title*="אקסל"], [title*="Excel"], text="אקסל"').first();
    await excelBtn.click({ force: true });
    return await downloadPromise;
  } catch (e) {
    return null;
  }
}