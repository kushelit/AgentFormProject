// scripts/portalRunner/src/providers/menora/menora.shared.ts
import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";

async function softIdle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => {});
}

function s(v: any) {
  return String(v ?? "").trim();
}

const SEL = {
  username: 'input#username[name="username"], input[name="username"], input[id*="user"]',
  phoneNumber: 'input#phoneNumber[name="phoneNumber"], input[name*="phone"], input[id*="phone"], input[name*="sapn"], input[id*="sapn"]',

  // OTP (כמה שדות / שדה ראשון)
  otpFirst: 'input#otp-input-1, input[id^="otp-input-"], input[name*="otp"], input[id*="otp"]',

  // רק לשלב טלפון/SAPN (שם כן יש אישור)
  approveBtn: (page: Page) => page.getByRole("button", { name: /אישור|המשך|כניסה|שלח/i }),

  // "נכנסנו" – גמיש
  logoInside:
    'a.logo[href*="agents-site"], img[src*="menora"], img[alt*="מנורה"], img[alt*="Menora"], a[href*="agents-site"]',
};

async function clickApproveNearVisibleField(page: Page, preferredFieldSelector: string) {
  const field = page.locator(preferredFieldSelector).first();
  const fieldVisible = await field.isVisible().catch(() => false);

  if (fieldVisible) {
    const container = field.locator("xpath=ancestor::*[self::form or self::section or self::div][1]");
    const btnInContainer = container.getByRole("button", { name: /אישור|המשך|כניסה|שלח/i }).first();
    if (await btnInContainer.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForLoadState("domcontentloaded").catch(() => {}),
        btnInContainer.click(),
      ]);
      return;
    }
  }

  const btn = SEL.approveBtn(page).first();
  await btn.waitFor({ state: "visible", timeout: 30_000 });
  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => {}),
    btn.click(),
  ]);
}

export async function menoraFillUsername(page: Page, username: string) {
  const u = s(username);
  if (!u) throw new Error("menoraFillUsername: empty username");

  const loc = page.locator(SEL.username).first();
  await loc.waitFor({ state: "visible", timeout: 30_000 });
  await loc.fill(u);

  console.log("[Menora] username filled");
}

export async function menoraFillPhoneAndApprove(page: Page, phoneNumber: string) {
  const p = s(phoneNumber);
  if (!p) throw new Error("menoraFillPhoneAndApprove: empty phoneNumber/SAPN");

  const loc = page.locator(SEL.phoneNumber).first();
  await loc.waitFor({ state: "visible", timeout: 30_000 });
  await loc.fill(p);

  // ✅ בשלב הזה כן לוחצים אישור
  await clickApproveNearVisibleField(page, SEL.phoneNumber);

  await softIdle(page);
  console.log("[Menora] after phone approve. url:", page.url());
}

/**
 * OTP: manual / firestore
 * במנורה (לפי מה שאת רואה) — אחרי הקלדה זה מאשר אוטומטית, בלי כפתור.
 */
export async function menoraHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp } = ctx;
  const otpMode = String((ctx.run as any)?.otp?.mode || "manual").toLowerCase();

  const otpField = page.locator(SEL.otpFirst).first();
  const hasOtp = await otpField.isVisible().catch(() => false);
  if (!hasOtp) {
    console.log("[Menora] OTP not detected");
    return;
  }

  // ========== MANUAL ==========
  if (otpMode === "manual") {
    await setStatus(runId, {
      status: "otp_required",
      step: "menora_otp_required_manual",
      otp: {
        mode: "manual",
        state: "required",
        hint: "🔐 ממתין להזנת קוד אימות בפורטל מנורה...",
      },
    });

    console.log("[Menora] waiting manual OTP...");
    await page.waitForSelector(SEL.logoInside, { state: "visible", timeout: 180_000 });
    await softIdle(page);

    await setStatus(runId, { status: "logged_in", step: "menora_logged_in" });
    return;
  }

  // ========== FIRESTORE ==========
  await setStatus(runId, {
    status: "otp_required",
    step: "menora_otp_required",
    otp: { mode: "firestore", state: "required" },
  });

  const otp = await pollOtp(runId);
  const otpStr = s(otp);
  if (!otpStr) throw new Error("Menora OTP empty (from Firestore)");

  await otpField.click();
  await page.keyboard.type(otpStr, { delay: 20 });

  // ✅ אין click על אישור — מחכים לכניסה אוטומטית
  await clearOtp(runId);

  // לפעמים יש redirect/טעינה קצרה
  await page.waitForSelector(SEL.logoInside, { state: "visible", timeout: 90_000 });
  await softIdle(page);

  await setStatus(runId, { status: "logged_in", step: "menora_logged_in" });
  console.log("[Menora] logged in (after otp auto-approve). url:", page.url());
}

export async function menoraEnsureLoggedIn(page: Page) {
  await page.waitForSelector(SEL.logoInside, { state: "visible", timeout: 60_000 });
  console.log("[Menora] logo detected (inside)");
}
