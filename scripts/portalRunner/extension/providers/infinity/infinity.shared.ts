import { providerAuthenticated, waitForProviderAuthentication, continueIfAuthenticated } from '../../auth-providers';
// Ported from the native provider; browser report keys replace local files.
import type { Page } from "../../browser";
import type { RunnerCtx } from "../../types";
function esc(v: string) {
    return String(v ?? "").replace(/'/g, "\\'");
}
export async function infinityLogin(page: Page, idNumber: string) {
    if (await providerAuthenticated(page,'infinity')) return;
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 20; i++) {
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('[data-vv-as="ת.ז. מספר"]') ? 'FOUND' : 'NOT_FOUND'`,
            returnByValue: true,
        });
        if (check.result.value === "FOUND")
            break;
        await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(500);
    const idResult = await cdp.send("Runtime.evaluate", {
        expression: `(function(val) {
      const el = document.querySelector('[data-vv-as="ת.ז. מספר"]');
      if (!el) return 'NOT_FOUND';
      el.focus();
      el.select();
      document.execCommand('insertText', false, val);
      return 'val:' + el.value;
    })('${esc(idNumber)}')`,
        returnByValue: true,
    });
    await page.waitForTimeout(500);
    const btnResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btn = document.querySelector('button.form-submit-button');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(4000);
}
export async function infinityHandleOtp(page: Page, ctx: RunnerCtx) {
    if (await continueIfAuthenticated(page,ctx,'infinity')) return;
    const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
    const monthLabel = run?.monthLabel || "חודש נוכחי";
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 20; i++) {
        if (await continueIfAuthenticated(page,ctx,'infinity')) return;
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('[data-vv-as="קוד"]') ? 'FOUND' : 'NOT_FOUND'`,
            returnByValue: true,
        });
        if (check.result.value === "FOUND")
            break;
        await page.waitForTimeout(1000);
    }
    await setStatus(runId, {
        status: "otp_required",
        step: "ממתין לקוד אימות מאינפיניטי גמל",
        "otp.mode": "firestore",
        monthLabel,
    });
    const authentication_otp = await waitForProviderAuthentication(page,ctx,'infinity');
    if (authentication_otp.kind === 'authenticated') return;
    const otp = authentication_otp.code;
    if (!otp)
        throw new Error("OTP Timeout");
    const otpPos = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const el = document.querySelector('[data-vv-as="קוד"]');
      if (!el) return null;
      el.focus();
      const rect = el.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    })()`,
        returnByValue: true,
    });
    const pos = JSON.parse(otpPos.result.value || "null");
    if (!pos)
        throw new Error("OTP input position not found");
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(300);
    await page.keyboard.type(otp, { delay: 150 });
    await page.waitForTimeout(500);
    const btnResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btn = document.querySelector('button.form-submit-button');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(4000);
    await clearOtp(runId).catch(() => { });
}
export async function infinityNavigateAndExport(page: Page): Promise<import("playwright").Download | null> {
    return null;
}
