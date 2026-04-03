import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";

/**
 * לוגין מיטב בגישת CDP (Ayalon Style)
 */
export async function meitavLogin(page: Page, idNumber: string, fullPhone: string) {
  console.log("[Meitav] Filling credentials via CDP...");

  // חיתוך הטלפון: קידומת (050) ושאר המספר (1234567)
  const prefix = fullPhone.substring(0, 3);
  const suffix = fullPhone.substring(3);

  const cdp = await page.context().newCDPSession(page);

  // הזרקה דרך CDP Runtime
  const fillResult = await cdp.send("Runtime.evaluate", {
    expression: `(function(u, pref, suff) {
      const idInput = document.querySelector('#Id');
      const prefSelect = document.querySelector('#PrefixMobile');
      const phoneInput = document.querySelector('#Phone');
      const btn = document.querySelector('#btnLogin');

      if (!idInput || !prefSelect || !phoneInput) return 'FIELDS_NOT_FOUND';

      // מילוי ת"ז
      idInput.value = u;
      idInput.dispatchEvent(new Event('input', { bubbles: true }));

      // בחירת קידומת
      prefSelect.value = pref;
      prefSelect.dispatchEvent(new Event('change', { bubbles: true }));

      // מילוי המשך הטלפון
      phoneInput.value = suff;
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));

      // לחיצה על כפתור כניסה
      setTimeout(() => { if (btn) btn.click(); }, 500);
      
      return 'SUCCESS';
    })('${idNumber}', '${prefix}', '${suffix}')`,
    returnByValue: true,
  });

  console.log("[Meitav] CDP Fill Result:", fillResult.result.value);
  if (fillResult.result.value !== 'SUCCESS') {
    throw new Error(`Login fields filling failed: ${fillResult.result.value}`);
  }
}

/**
 * טיפול ב-OTP מיטב בגישת CDP
 */
export async function meitavHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";

  console.log("[Meitav] Waiting for OTP input field...");
  await page.waitForSelector('#Code', { timeout: 30000 });

  await setStatus(runId, {
    status: "otp_required",
    step: "ממתין לקוד אימות ממיטב",
    "otp.mode": "firestore",
    monthLabel
  });

  const otp = await pollOtp(runId);
  if (!otp) throw new Error("קוד ה-OTP לא התקבל");

  const cdp = await page.context().newCDPSession(page);
  
  const otpResult = await cdp.send("Runtime.evaluate", {
    expression: `(function(code) {
      const input = document.querySelector('#Code');
      const btn = document.querySelector('#btnLogin');
      if (!input) return 'INPUT_NOT_FOUND';
      
      input.value = code;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      setTimeout(() => { if (btn) btn.click(); }, 500);
      return 'OTP_INJECTED';
    })('${otp}')`,
    returnByValue: true,
  });

  console.log("[Meitav] CDP OTP Result:", otpResult.result.value);
  await page.waitForTimeout(5000);
  await clearOtp(runId).catch(() => {});
}