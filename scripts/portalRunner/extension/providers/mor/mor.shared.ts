import { providerAuthenticated, waitForProviderAuthentication, continueIfAuthenticated } from '../../auth-providers';
// Ported from the native provider; browser report keys replace local files.
import type { Page } from "../../browser";
import type { RunnerCtx } from "../../types";
function esc(v: string) {
    return String(v ?? "").replace(/'/g, "\\'");
}
export async function morLogin(page: Page, licenseNumber: string, username: string, phoneNumber: string) {
    if (await providerAuthenticated(page,'mor')) return;
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
    // fill('input[placeholder="הקלד טלפון"]', phone); // ✅ תוקן
    // await wait(600);

    // טלפון — הקלדה תו תו בגלל validation
    const phoneEl = document.querySelector('input[placeholder="הקלד טלפון"]');
    if (phoneEl) {
      phoneEl.focus();
      for (const ch of phone) {
        phoneEl.value += ch;
        phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(80);
      }
      phoneEl.dispatchEvent(new Event('change', { bubbles: true }));
      phoneEl.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    await wait(300);
    
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
}
export async function morHandleOtp(page: Page, ctx: RunnerCtx) {
    if (await continueIfAuthenticated(page,ctx,'mor')) return;
    const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
    const monthLabel = run?.monthLabel || "חודש נוכחי";
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 20; i++) {
        if (await continueIfAuthenticated(page,ctx,'mor')) return;
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('input[formcontrolname="otpCode"]') ? 'FOUND' : 'NOT_FOUND'`,
            returnByValue: true,
        });
        if (check.result.value === 'FOUND')
            break;
        await page.waitForTimeout(1000);
    }
    await setStatus(runId, {
        status: "otp_required",
        step: "ממתין לקוד אימות ממור",
        "otp.mode": "firestore",
        monthLabel,
    });
    const authentication_otp = await waitForProviderAuthentication(page,ctx,'mor');
    if (authentication_otp.kind === 'authenticated') return;
    const otp = authentication_otp.code;
    if (!otp)
        throw new Error("OTP Timeout");
    const inputPos = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const input = document.querySelector('input[formcontrolname="otpCode"]');
      if (!input) return null;
      const rect = input.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
    })()`,
        returnByValue: true,
    });
    const pos = JSON.parse(inputPos.result.value || 'null');
    if (!pos)
        throw new Error("OTP input position not found");
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('input[formcontrolname="otpCode"]');
        if (!input || input.disabled) throw new Error('MOR_OTP_INPUT_UNAVAILABLE');
        input.focus();
    });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(otp, { delay: 150 });
    const hasCode = (expected: string) => {
        const input = document.querySelector<HTMLInputElement>('input[formcontrolname="otpCode"]');
        return input?.value.replace(/\s/g,'') === expected.replace(/\s/g,'');
    };
    let codeEntered = await page.evaluate(hasCode, otp);
    if (!codeEntered) {
        // Retry only text insertion, never submission or a portal action.
        await page.evaluate(() => document.querySelector<HTMLInputElement>('input[formcontrolname="otpCode"]')?.focus());
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await cdp.send('Input.insertText',{text:otp});
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Tab');
        await page.waitForFunction(hasCode,otp,{timeout:2000}).catch(() => {});
        codeEntered = await page.evaluate(hasCode,otp);
    }
    if (!codeEntered) throw new Error('MOR_OTP_INPUT_NOT_FILLED');
    // The portal validates on keyboard events. Submit only after its own button
    // becomes enabled; never bypass validation or navigate while OTP is pending.
    await page.waitForFunction(() => {
        const input = document.querySelector('input[formcontrolname="otpCode"]');
        const root = input?.closest('[role="dialog"], .modal, .modal-content, form') || document;
        return Array.from(root.querySelectorAll('button')).some((button: any) =>
            button.textContent?.trim() === 'כניסה' && !button.disabled && button.getClientRects().length);
    }, undefined, {timeout:15000}).catch(() => {throw new Error('MOR_OTP_BUTTON_DISABLED');});
    const submitPos = await page.evaluate(() => {
        const input = document.querySelector('input[formcontrolname="otpCode"]');
        const root = input?.closest('[role="dialog"], .modal, .modal-content, form') || document;
        const button = Array.from(root.querySelectorAll('button')).find((button: any) =>
            button.textContent?.trim() === 'כניסה' && !button.disabled && button.getClientRects().length);
        if (!button) return null;
        button.scrollIntoView({block:'center'});
        const rect = button.getBoundingClientRect();
        return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    });
    if (!submitPos) throw new Error('MOR_OTP_BUTTON_NOT_FOUND');
    await page.mouse.click(submitPos.x,submitPos.y);
    await page.waitForFunction(() => {
        const input = document.querySelector('input[formcontrolname="otpCode"]');
        return !input || !input.getClientRects().length;
    }, undefined, {timeout:30000}).catch(() => {throw new Error('MOR_OTP_NOT_ACCEPTED');});
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
    await clearOtp(runId).catch(() => { });
}
export async function morNavigateToReport(page: Page, requestedReportMonth?: string): Promise<import("playwright").Download | null> {
    const cdp = await page.context().newCDPSession(page);
    const closePopup = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btn = document.querySelector('button.btn-close-modal');
      if (!btn) return 'NO_POPUP';
      btn.click();
      return 'POPUP_CLOSED';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(1000);
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
    await page.waitForTimeout(3000);
    await page.waitForTimeout(3000);
    let targetMonth: string;
    let targetYear: string;
    if (requestedReportMonth) {
        const [y, m] = requestedReportMonth.split('-');
        targetYear = y;
        targetMonth = m;
    }
    else {
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        targetMonth = String(target.getMonth() + 1).padStart(2, '0');
        targetYear = String(target.getFullYear());
    }
    const dateInputPos = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const input = document.querySelector('input[role="spinbutton"][aria-haspopup="true"]');
      if (!input) return null;
      const rect = input.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
    })()`,
        returnByValue: true,
    });
    const datePos = JSON.parse(dateInputPos.result.value || 'null');
    if (datePos) {
        await page.mouse.click(datePos.x, datePos.y);
        await page.waitForTimeout(300);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(200);
        await page.keyboard.type(targetMonth, { delay: 150 });
        await page.waitForTimeout(300);
        await page.keyboard.type(targetYear, { delay: 150 });
        await page.waitForTimeout(500);
    }
    else {
    }
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
    await page.waitForTimeout(3000);
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
        return download;
    }
    catch (e: any) {
        throw new Error(e?.message === 'WAIT_TIMEOUT_download' ? 'MOR_REPORT_DOWNLOAD_TIMEOUT' : 'MOR_REPORT_EXPORT_FAILED');
    }
}
export async function morNavigateToVolumeReport(page: Page): Promise<import("playwright").Download | null> {
    const cdp = await page.context().newCDPSession(page);
    const navResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const items = Array.from(document.querySelectorAll('ul.k-drawer-items li[class*="k-drawer-item"]'));
      const target = items.find(li =>
        (li.getAttribute('aria-label') || '').includes('דוח גיוסים') ||
        (li.textContent || '').includes('דוח גיוסים')
      );
      if (!target) return 'NOT_FOUND: ' + items.map(li => li.getAttribute('aria-label')).join(' | ');
      target.scrollIntoView();
      target.click();
      return 'CLICKED';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(3000);
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
        return download;
    }
    catch (e: any) {
        return null;
    }
}
