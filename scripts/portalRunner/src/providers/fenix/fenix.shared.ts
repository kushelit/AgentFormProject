import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";

async function softIdle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => {});
}

/**
 * כניסה: Username + Password ואז "המשך"
 * משתמש ב-name (יותר יציב מ-id)
 */
export async function fenixLogin(page: Page, username: string, password: string) {
  const userSel = 'input[name="username"]';
  const passSel = 'input[name="password"]';
  const continueSel = 'input[type="submit"][value="המשך"]';

  await page.waitForSelector(userSel, { state: "visible", timeout: 30_000 });
  await page.waitForSelector(passSel, { state: "visible", timeout: 30_000 });

  await page.fill(userSel, username);
  await page.fill(passSel, password);

  const continueBtn = page.locator(continueSel).first();
  await continueBtn.waitFor({ state: "visible", timeout: 30_000 });

  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    continueBtn.click(),
  ]);

  await softIdle(page);
  console.log("[Fenix] clicked continue (after password). url:", page.url());
}

/**
 * OTP: בפניקס השדה הוא שוב name="password" (לא ייחודי)
 * לכן מזהים "מסך OTP" לפי הופעת כפתור "כניסה"
 *
 * תומך בשני מצבים:
 * - manual: הסוכן מזין בפורטל
 * - firestore: ה-UI שלנו כותב otp.value למסמך, וה-runner ממלא
 */
export async function fenixHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp } = ctx;
  const otpMode = String((ctx.run as any)?.otp?.mode || "manual").toLowerCase();

  const otpInputSel = 'input[name="password"]';
  const loginBtnSel = 'input[type="submit"][value="כניסה"]';

  // נזהה אם בכלל יש OTP: נחכה קצת לראות אם מופיע כפתור "כניסה"
  const hasOtp = await page
    .locator(loginBtnSel)
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!hasOtp) {
    console.log("[Fenix] OTP screen not detected (no כניסה button). assume logged in / no otp.");
    await setStatus(runId, { status: "logged_in", step: "fenix_logged_in_no_otp" });
    return;
  }

  // ==========================
  // MANUAL MODE
  // ==========================
  if (otpMode === "manual") {
    await setStatus(runId, {
      status: "otp_required",
      step: "fenix_otp_required_manual",
      otp: {
        mode: "manual",
        state: "required",
        hint: "🔐 ממתין להזנת קוד זיהוי בפורטל הפניקס...",
      },
    });

    console.log("[Fenix] OTP manual mode: waiting for user to complete OTP in portal...");

    // מחכים להתקדמות: כפתור "כניסה" נעלם / או מופיע "התנתק" / או משתנה URL
    const startUrl = page.url();

    await page.waitForFunction(
      ({ loginBtnSel, startUrl }) => {
        const loginBtn = document.querySelector(loginBtnSel) as HTMLElement | null;
        if (!loginBtn) return true; // כפתור נעלם => התקדמנו

        const logout = Array.from(document.querySelectorAll("*")).find((el) =>
          (el as HTMLElement)?.innerText?.trim().includes("התנתק")
        );
        if (logout) return true;

        if (location.href !== startUrl) return true;

        return false;
      },
      { loginBtnSel, startUrl },
      { timeout: 180_000 }
    );

    await softIdle(page);

    await setStatus(runId, { status: "logged_in", step: "fenix_logged_in" });
    console.log("[Fenix] progressed after manual OTP. url:", page.url());
    return;
  }

  // ==========================
  // FIRESTORE MODE
  // ==========================
  await setStatus(runId, {
    status: "otp_required",
    step: "fenix_otp_required",
    otp: { mode: "firestore", state: "required" },
  });

  const otp = await pollOtp(runId);
  console.log("[Fenix] got OTP from Firestore");

  await page.waitForSelector(otpInputSel, { state: "visible", timeout: 30_000 });
  await page.fill(otpInputSel, otp);

  const loginBtn = page.locator(loginBtnSel).first();
  await loginBtn.waitFor({ state: "visible", timeout: 30_000 });

  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => {}),
    loginBtn.click(),
  ]);

  await softIdle(page);

  // ניקוי OTP רק במצב firestore
  await clearOtp(runId);

  await setStatus(runId, { status: "logged_in", step: "fenix_logged_in" });
  console.log("[Fenix] logged in (after otp). url:", page.url());
}
