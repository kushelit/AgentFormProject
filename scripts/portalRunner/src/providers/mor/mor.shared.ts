import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";

function esc(v: string) {
  return String(v ?? "").replace(/'/g, "\\'");
}

/**
 * Login – מור
 */
export async function morLogin(
  page: Page,
  licenseNumber: string,
  username: string,
  phoneNumber: string
) {
  // console.log("[Mor] Filling login via CDP...");

  const cdp = await page.context().newCDPSession(page);

 const result = await cdp.send("Runtime.evaluate", {
  expression: `(async function(lic, id, phone) {
    function fill(selector, value) {
      const el = document.querySelector(selector);
      if (!el) return false;
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    }

    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    fill('input[formcontrolname="licenseId"]', lic);
    await wait(300);
    fill('input[formcontrolname="identity"]', id);
    await wait(300);
    fill('input[placeholder="הקלד טלפון"]', phone); // ✅ תוקן
    await wait(600);

    const mobileVal = document.querySelector('input[placeholder="הקלד טלפון"]')?.value;
    if (!mobileVal) return 'MOBILE_EMPTY';

    const btn = document.querySelector('button[type="submit"]');
    if (!btn) return 'BTN_NOT_FOUND';
    btn.removeAttribute('disabled');
    btn.click();
    return 'SUBMITTED: mobile=' + mobileVal;
  })('${esc(licenseNumber)}', '${esc(username)}', '${esc(phoneNumber)}')`,
  returnByValue: true,
  awaitPromise: true,
});

  // console.log("[Mor] Login result:", result.result.value);
}

/**
 * OTP – מור
 */
export async function morHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";

  const cdp = await page.context().newCDPSession(page);

  // console.log("[Mor] Waiting for OTP screen...");
  for (let i = 0; i < 20; i++) {
    // console.log("[Mor] current URL:", page.url());
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('input[formcontrolname="otpCode"]') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    // console.log(`[Mor] OTP check ${i+1}:`, check.result.value);
    if (check.result.value === 'FOUND') break;
    await page.waitForTimeout(1000);
  }

  await setStatus(runId, {
    status: "otp_required",
    step: "ממתין לקוד אימות ממור",
    "otp.mode": "firestore",
    monthLabel,
  });

  const otp = await pollOtp(runId);
  if (!otp) throw new Error("OTP Timeout");

  // console.log("[Mor] OTP received:", otp);

  // ✅ מצא מיקום השדה דרך CDP
  const inputPos = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const input = document.querySelector('input[formcontrolname="otpCode"]');
      if (!input) return null;
      const rect = input.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
    })()`,
    returnByValue: true,
  });
  // console.log("[Mor] OTP input position:", inputPos.result.value);

  const pos = JSON.parse(inputPos.result.value || 'null');
  if (!pos) throw new Error("OTP input position not found");

  // ✅ לחץ פיזית על השדה והקלד כמו אדם
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  await page.keyboard.type(otp, { delay: 150 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');

  // ✅ המתן ובדוק מה קרה
  await page.waitForTimeout(3000);
  // console.log("[Mor] URL after OTP:", page.url());

  const afterOtp = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      return JSON.stringify({
        url: window.location.href,
        otpInput: !!document.querySelector('input[formcontrolname="otpCode"]'),
        errorMsg: document.querySelector('.error, .alert, [class*="error"]')?.textContent?.trim() || ''
      });
    })()`,
    returnByValue: true,
  });
  // console.log("[Mor] After OTP state:", afterOtp.result.value);

  await clearOtp(runId).catch(() => {});
}

export async function morNavigateToReport(page: Page): Promise<import("playwright").Download | null> {
  // console.log("[Mor] Navigating to report...");

  const cdp = await page.context().newCDPSession(page);

  // ✅ שלב 1: סגור popup אם קיים
  const closePopup = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const btn = document.querySelector('button.btn-close-modal');
      if (!btn) return 'NO_POPUP';
      btn.click();
      return 'POPUP_CLOSED';
    })()`,
    returnByValue: true,
  });
  // console.log("[Mor] Popup:", closePopup.result.value);
  await page.waitForTimeout(1000);

  // ✅ שלב 2: לחץ על "חישוב תגמול" בתפריט הצדדי
  const navResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const items = Array.from(document.querySelectorAll('ul.k-drawer-items li[class*="k-drawer-item"]'));
      const target = items.find(li =>
        (li.getAttribute('aria-label') || '').includes('חישוב תגמול') ||
        (li.textContent || '').includes('חישוב תגמול')
      );
      if (!target) return 'NOT_FOUND: ' + items.map(li => li.getAttribute('aria-label')).join(' | ');
      target.scrollIntoView();
      target.click();
      return 'CLICKED: ' + target.getAttribute('aria-label');
    })()`,
    returnByValue: true,
  });
  // console.log("[Mor] Nav result:", navResult.result.value);
  await page.waitForTimeout(3000);
  // console.log("[Mor] URL after nav:", page.url());

  // ✅ שלב 3: לחץ על כפתור "חפש"
  const searchResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const btns = Array.from(document.querySelectorAll('button[class*="k-button"]'));
      const btn = btns.find(b => (b.textContent || '').trim().includes('חפש'));
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  // console.log("[Mor] Search result:", searchResult.result.value);
  await page.waitForTimeout(3000);

  // ✅ שלב 4: לחץ על "ייצוא לאקסל" והמתן להורדה
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      cdp.send("Runtime.evaluate", {
        expression: `(function() {
          const btn = document.querySelector('button[kendogridexcelcommand], button[class*="k-grid-excel"]');
          if (!btn) return 'NOT_FOUND';
          btn.click();
          return 'CLICKED';
        })()`,
        returnByValue: true,
      }),
    ]);
    // console.log("[Mor] Download started:", download.suggestedFilename());
    return download;
  } catch (e: any) {
    // console.log("[Mor] Export failed:", e?.message);
    return null;
  }
}