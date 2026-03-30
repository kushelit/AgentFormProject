import type { Page, Download } from "playwright";
import type { RunnerCtx } from "../../types";

/**
 * לוגין הראל - הזרקת String
 */
export async function harelLogin(page: Page, u: string, p: string) {
  const script = `
    (function(user, pass) {
      const uInput = document.querySelector('#input_1');
      const pInput = document.querySelector('#input_2');
      const btn = document.querySelector('input.credentials_input_submit');
      if (uInput && pInput && btn) {
        uInput.value = user;
        pInput.value = pass;
        uInput.dispatchEvent(new Event('input', { bubbles: true }));
        pInput.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => btn.click(), 200);
      }
    })('${u}', '${p}')
  `;
  await page.evaluate(script);
}

/**
 * טיפול ב-OTP הראל (input_1)
 */
export async function harelHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, pollOtp, clearOtp } = ctx;
  const otpCode = await pollOtp(runId);
  if (!otpCode) throw new Error("OTP Timeout");

  const script = `
    (function(code) {
      const input = document.querySelector('#input_1');
      const btn = document.querySelector('input.credentials_input_submit');
      if (input && btn) {
        input.value = code;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => btn.click(), 200);
      }
    })('${otpCode}')
  `;
  await page.evaluate(script);
  await clearOtp(runId).catch(() => {});
}

/**
 * ניווט באמצעות הלינק העמוק שסיפקת
 */
export async function harelNavigateByDeepLink(page: Page, dateStr: string) {
  // בניית הלינק עם התאריך הדינמי (מופיע פעמיים בלינק)
  const baseUrl = "https://agents-int.harel-group.co.il/Information/Reports/life-health-saving/Agent/Pages/commissions/payments-assembly/paid.aspx";
  const finalUrl = `${baseUrl}?FilterParams=Sochen_List|16752~monthnahonut_Date_F|${dateStr}~monthnahonut_Date_T|${dateStr}`;
  
  console.log(`[Harel] Navigating to Deep Link: ${finalUrl}`);
  await page.goto(finalUrl, { waitUntil: "networkidle", timeout: 60000 });
}

/**
 * הורדת אקסל (נצטרך לדייק את הסלקטור אחרי שתראי את הדף)
 */
export async function harelExportExcel(page: Page): Promise<Download | null> {
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    
    // ניסיון לחיצה על כפתור אקסל גנרי (נפוץ בפורטלים אלו)
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('a, button, img'))
        .find(el => {
          const txt = (el.textContent || "").toLowerCase();
          const src = (el as HTMLImageElement).src || "";
          return txt.includes('אקסל') || txt.includes('excel') || src.includes('Excel');
        });
      if (btn) (btn as HTMLElement).click();
    });

    return await downloadPromise;
  } catch (e) {
    console.log("[Harel] Download not triggered or timed out");
    return null;
  }
}