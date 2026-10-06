import { providerAuthenticated, waitForProviderAuthentication, continueIfAuthenticated } from '../../auth-providers';
// Ported from the native provider; browser report keys replace local files.
import type { Page } from "../../browser";
import type { RunnerCtx } from "../../types";
import { reportPath as path } from "../../report-store";
function esc(v: string) {
    return String(v ?? "").replace(/'/g, "\\'");
}
function getTwoMonthsAgoPickerTitle(): string {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}
export async function yalinLogin(page: Page, idNumber: string, phoneNumber: string) {
    if (await providerAuthenticated(page,'yalinlapidot')) return;
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 20; i++) {
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('input[name="personalId"]') ? 'FOUND' : 'NOT_FOUND'`,
            returnByValue: true,
        });
        if (check.result.value === "FOUND")
            break;
        await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(500);
    const idResult = await cdp.send("Runtime.evaluate", {
        expression: `(function(val) {
      const el = document.querySelector('input[name="personalId"]');
      if (!el) return 'NOT_FOUND';
      el.focus();
      el.select();
      document.execCommand('insertText', false, val);
      return 'val:' + el.value;
    })('${esc(idNumber)}')`,
        returnByValue: true,
    });
    await page.waitForTimeout(400);
    const idAfter = await cdp.send("Runtime.evaluate", {
        expression: `document.querySelector('input[name="personalId"]')?.value || 'EMPTY'`,
        returnByValue: true,
    });
    const phoneResult = await cdp.send("Runtime.evaluate", {
        expression: `(function(val) {
      const el = document.querySelector('input[name="mobileNumber"]');
      if (!el) return 'NOT_FOUND';
      el.focus();
      el.select();
      document.execCommand('insertText', false, val);
      return 'val:' + el.value;
    })('${esc(phoneNumber)}')`,
        returnByValue: true,
    });
    await page.waitForTimeout(400);
    const phoneAfter = await cdp.send("Runtime.evaluate", {
        expression: `document.querySelector('input[name="mobileNumber"]')?.value || 'EMPTY'`,
        returnByValue: true,
    });
    const finalCheck = await cdp.send("Runtime.evaluate", {
        expression: `JSON.stringify({
      id: document.querySelector('input[name="personalId"]')?.value || 'EMPTY',
      phone: document.querySelector('input[name="mobileNumber"]')?.value || 'EMPTY',
      cbChecked: document.querySelector('input[name="confirm"]')?.checked || false,
      btnExists: !!document.querySelector('button.continue-btn')
    })`,
        returnByValue: true,
    });
    await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const cb = document.querySelector('input[name="confirm"]');
      if (cb && !cb.checked) cb.click();
      setTimeout(() => {
        const btn = document.querySelector('button.continue-btn');
        if (btn) btn.click();
      }, 500);
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(4000);
}
export async function yalinHandleOtp(page: Page, ctx: RunnerCtx) {
    if (await continueIfAuthenticated(page,ctx,'yalinlapidot')) return;
    const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
    const monthLabel = run?.monthLabel || "חודש נוכחי";
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 20; i++) {
        if (await continueIfAuthenticated(page,ctx,'yalinlapidot')) return;
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('input[name="code"]') ? 'FOUND' : 'NOT_FOUND'`,
            returnByValue: true,
        });
        if (check.result.value === "FOUND")
            break;
        await page.waitForTimeout(1000);
    }
    await setStatus(runId, {
        status: "otp_required",
        step: "ממתין לקוד אימות מילין לפידות",
        "otp.mode": "firestore",
        monthLabel,
    });
    const authentication_otp = await waitForProviderAuthentication(page,ctx,'yalinlapidot');
    if (authentication_otp.kind === 'authenticated') return;
    const otp = authentication_otp.code;
    if (!otp)
        throw new Error("OTP Timeout");
    const otpPos = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const el = document.querySelector('input[name="code"]');
      if (!el) return null;
      el.focus();
      const rect = el.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
    })()`,
        returnByValue: true,
    });
    const pos = JSON.parse(otpPos.result.value || 'null');
    if (!pos)
        throw new Error("OTP input position not found");
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(300);
    await page.keyboard.type(otp, { delay: 150 });
    await page.waitForTimeout(500);
    await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btn = document.querySelector('button.continue-btn');
      if (btn) btn.click();
      return btn ? 'CLICKED' : 'NOT_FOUND';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(4000);
    await clearOtp(runId).catch(() => { });
}
async function selectYalinPickerMonth(cdp: any, page: Page, fieldSelector: string, targetYm: string) {
    const [targetYear] = targetYm.split('-');
    await cdp.send("Runtime.evaluate", {
        expression: `(function(sel) {
      const el = document.querySelector(sel);
      if (!el) return 'INPUT_NOT_FOUND';
      const rect = el.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 };
      el.dispatchEvent(new MouseEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return 'OPENED';
    })(${JSON.stringify(fieldSelector)})`,
        returnByValue: true,
    });
    await page.waitForTimeout(500);
    for (let i = 0; i < 5; i++) {
        const yearCheck = await cdp.send("Runtime.evaluate", {
            expression: `(function() {
        const btn = Array.from(document.querySelectorAll('.ant-picker-year-btn')).find(el => el.offsetParent !== null);
        return btn ? btn.textContent.trim() : '';
      })()`,
            returnByValue: true,
        });
        if (yearCheck.result.value === targetYear)
            break;
        await cdp.send("Runtime.evaluate", {
            expression: `(function() {
        const btn = Array.from(document.querySelectorAll('.ant-picker-header-super-prev-btn')).find(el => el.offsetParent !== null);
        if (btn) btn.click();
      })()`,
            returnByValue: true,
        });
        await page.waitForTimeout(500);
    }
    await cdp.send("Runtime.evaluate", {
        expression: `(function(title) {
      const cell = Array.from(document.querySelectorAll('td[title="' + title + '"]')).find(el => el.offsetParent !== null);
      if (cell) cell.click();
    })(${JSON.stringify(targetYm)})`,
        returnByValue: true,
    });
    await page.waitForTimeout(500);
}
export async function yalinNavigateAndExport(page: Page, requestedReportMonth?: string): Promise<import("playwright").Download | null> {
    const cdp = await page.context().newCDPSession(page);
    const targetYm = requestedReportMonth || getTwoMonthsAgoPickerTitle();
    await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const spans = Array.from(document.querySelectorAll('span.nav-link-text'));
      const target = spans.find(s => (s.textContent || '').includes('צפיה בדוח עמלות'));
      if (!target) return 'NOT_FOUND';
      const link = target.closest('a');
      if (link) link.click();
      else target.click();
      return 'CLICKED';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(3000);
    await selectYalinPickerMonth(cdp, page, '#toDate', targetYm);
    await selectYalinPickerMonth(cdp, page, '#fromDate', targetYm);
    await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btn = document.querySelector('button[type="submit"].data-filter__btn');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(5000);
    try {
        const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 60000 }),
            cdp.send("Runtime.evaluate", {
                expression: `(function() {
          const btn = document.querySelector('button.styled-btn.btn-excel');
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
