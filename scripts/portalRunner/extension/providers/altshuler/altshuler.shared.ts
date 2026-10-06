import { providerAuthenticated, waitForProviderAuthentication, continueIfAuthenticated } from '../../auth-providers';
// Ported from the native provider; browser report keys replace local files.
import type { Page } from "../../browser";
import type { RunnerCtx } from "../../types";
import { reportPath as path } from "../../report-store";
function getPrevMonthHebrew(requestedReportMonth?: string): string {
    const hebrewMonths = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
        'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    if (requestedReportMonth) {
        const monthIndex = Number(requestedReportMonth.split('-')[1]) - 1;
        return hebrewMonths[monthIndex];
    }
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return hebrewMonths[prevMonth.getMonth()];
}
export async function altshulerLogin(page: Page, companyId: string, idNumber: string, loginType: string = "company") {
    if (await providerAuthenticated(page,'altshuler')) return;
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 20; i++) {
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelectorAll('input.login-new-input-field').length`,
            returnByValue: true,
        });
        if (Number(check.result.value) >= 9)
            break;
        await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(500);
    if (loginType === "company") {
        await cdp.send("Runtime.evaluate", {
            expression: `(function() {
        const tab = document.querySelector('.text-left');
        if (!tab) return 'TAB_NOT_FOUND';
        if (!tab.classList.contains('active')) {
          tab.click();
          return 'CLICKED_TAB';
        }
        return 'ALREADY_ACTIVE';
      })()`,
            returnByValue: true,
        });
        await page.waitForTimeout(1000);
        await fillDigitBoxes(page, cdp, companyId, 0);
        await page.waitForTimeout(500);
        await fillDigitBoxes(page, cdp, idNumber, 9);
        await page.waitForTimeout(500);
    }
    else {
        await fillDigitBoxes(page, cdp, companyId, 0);
        await page.waitForTimeout(500);
        await fillDigitBoxes(page, cdp, idNumber, 8);
        await page.waitForTimeout(500);
    }
    const btnResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btn = document.querySelector('button.login-new-button-component');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED: ' + btn.textContent?.trim();
    })()`,
        returnByValue: true,
    });
}
async function altshulerWaitForPopupClosed(cdp: any, page: Page, maxAttempts = 10): Promise<void> {
    await page.waitForTimeout(2000).catch(() => { });
    for (let i = 0; i < maxAttempts; i++) {
        const check = await cdp.send("Runtime.evaluate", {
            expression: `(function() {
        const btn = document.querySelector('button.close[aria-label*="סגור"]');
        return !!(btn && btn.offsetParent !== null);
      })()`,
            returnByValue: true,
        });
        if (check.result.value !== true) {
            return;
        }
        await cdp.send("Runtime.evaluate", {
            expression: `(function() {
        const btn = document.querySelector('button.close[aria-label*="סגור"]');
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 };
        btn.dispatchEvent(new MouseEvent('pointerdown', opts));
        btn.dispatchEvent(new MouseEvent('mousedown', opts));
        btn.dispatchEvent(new MouseEvent('pointerup', opts));
        btn.dispatchEvent(new MouseEvent('mouseup', opts));
        btn.dispatchEvent(new MouseEvent('click', opts));
      })()`,
            returnByValue: true,
        });
        await page.waitForTimeout(700);
    }
}
async function fillDigitBoxes(page: any, cdp: any, value: string, startIndex: number) {
    const digits = value.replace(/\D/g, '');
    for (let i = 0; i < digits.length; i++) {
        const digit = digits[i];
        const boxIndex = startIndex + i;
        const result = await cdp.send("Runtime.evaluate", {
            expression: `(function(idx, val) {
        const boxes = Array.from(document.querySelectorAll('input.login-new-input-field'));
        const box = boxes[idx];
        if (!box) return 'BOX_NOT_FOUND_' + idx;
        box.focus();
        box.value = val;
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.dispatchEvent(new Event('change', { bubbles: true }));
        box.dispatchEvent(new Event('blur', { bubbles: true }));
        return 'OK';
      })(${boxIndex}, '${digit}')`,
            returnByValue: true,
        });
        if (result.result.value !== 'OK') {
        }
        await page.waitForTimeout(100);
    }
}
export async function altshulerHandleOtp(page: Page, ctx: RunnerCtx) {
    if (await continueIfAuthenticated(page,ctx,'altshuler')) return;
    const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
    const monthLabel = run?.monthLabel || "חודש נוכחי";
    const cdp = await page.context().newCDPSession(page);
    await page.waitForTimeout(3000);
    for (let i = 0; i < 10; i++) {
        if (await continueIfAuthenticated(page,ctx,'altshuler')) return;
        const url = page.url();
        if (!url.includes('login'))
            break;
        await page.waitForTimeout(1000);
    }
    for (let i = 0; i < 30; i++) {
        if (await continueIfAuthenticated(page,ctx,'altshuler')) return;
        const check = await cdp.send("Runtime.evaluate", {
            expression: `(function() {
        const boxes = Array.from(document.querySelectorAll('input.login-new-input-field'));
        // בדף ה-OTP יש 6 תיבות בלבד (לא 18 כמו בלוגין)
        return boxes.length === 6 ? 'FOUND' : 'NOT_FOUND_' + boxes.length;
      })()`,
            returnByValue: true,
        });
        if (check.result.value === 'FOUND')
            break;
        await page.waitForTimeout(1000);
    }
    await setStatus(runId, {
        status: "otp_required",
        step: "ממתין לקוד אימות מאלטשולר",
        "otp.mode": "firestore",
        monthLabel,
    });
    const authentication_otp = await waitForProviderAuthentication(page,ctx,'altshuler');
    if (authentication_otp.kind === 'authenticated') return;
    const otp = authentication_otp.code;
    if (!otp)
        throw new Error("קוד ה-OTP לא התקבל");
    await fillDigitBoxes(page, cdp, otp, 0);
    await page.waitForTimeout(500);
    const btnResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
    // נסה קלאס ספציפי של דף OTP
    const btn = document.querySelector('button.verify-otp-component-submit-button') 
              || document.querySelector('button.login-new-button-component');
    if (!btn) return 'NOT_FOUND';
    btn.click();
    return 'CLICKED: ' + btn.textContent?.trim();
  })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 15; i++) {
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('.nav-items, nav[role="navigation"]') ? 'LOGGED_IN' : 'WAITING'`,
            returnByValue: true,
        });
        if (check.result.value === 'LOGGED_IN')
            break;
        await page.waitForTimeout(1000);
    }
    await clearOtp(runId).catch(() => { });
    await altshulerWaitForPopupClosed(cdp, page);
}
export async function altshulerNavigateAndExport(page: Page, absDir: string, requestedReportMonth?: string): Promise<{
    reportKey: string;
    filename: string;
}[]> {
    const results: {
        reportKey: string;
        filename: string;
    }[] = [];
    const cdp = await page.context().newCDPSession(page);
    await altshulerWaitForPopupClosed(cdp, page);
    const targetMonth = getPrevMonthHebrew(requestedReportMonth);
    const hoverResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const navItems = Array.from(document.querySelectorAll('.nav-item.has-submenu'));
      const target = navItems.find(el => (el.textContent || '').trim().includes('עמלות'));
      if (!target) return 'NOT_FOUND';
      target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return 'HOVERED';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(1000);
    const subMenuResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const links = Array.from(document.querySelectorAll('a[role="link"], a.nav-item'));
      const target = links.find(a => (a.textContent || '').trim().includes('עמלות נפרעים') && 
                                     (a.textContent || '').trim().includes('גמל'));
      if (!target) {
        // נסה לפי aria-label
        const byAria = document.querySelector('a[aria-label*="גמל"][aria-label*="עמלות"]');
        if (byAria) { byAria.click(); return 'CLICKED_ARIA'; }
        return 'NOT_FOUND: ' + links.map(a => a.textContent?.trim()).join(' | ');
      }
      target.click();
      return 'CLICKED: ' + target.textContent?.trim();
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(3000);
    const tabResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const tabs = Array.from(document.querySelectorAll('[role="tab"], .mdc-tab'));
      const target = tabs.find(t => (t.textContent || '').trim().includes('פירוט עמלות סוכנים לפי קופה'));
      if (!target) return 'NOT_FOUND: ' + tabs.map(t => t.textContent?.trim()).join(' | ');
      target.click();
      return 'CLICKED';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(2000);
    const selectPos = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      // מחפש mat-select של חודש
      const selects = Array.from(document.querySelectorAll('mat-select'));
      const monthSelect = selects.find(s => {
        const val = s.querySelector('.mat-mdc-select-value')?.textContent || '';
        const label = s.closest('mat-form-field')?.textContent || '';
        return label.includes('חודש') || val.includes('ינואר') || val.includes('פברואר');
      }) || selects[0]; // fallback לראשון
      if (!monthSelect) return null;
      const rect = monthSelect.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
    })()`,
        returnByValue: true,
    });
    const pos = JSON.parse(selectPos.result.value || 'null');
    if (!pos)
        throw new Error("Month select not found");
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(1000);
    const monthResult = await cdp.send("Runtime.evaluate", {
        expression: `(function(month) {
      const options = Array.from(document.querySelectorAll('mat-option'));
      const target = options.find(o => (o.textContent || '').trim() === month);
      if (!target) return 'NOT_FOUND: ' + options.map(o => o.textContent?.trim()).join(' | ');
      target.click();
      return 'CLICKED: ' + target.textContent?.trim();
    })('${targetMonth}')`,
        returnByValue: true,
    });
    await page.waitForTimeout(500);
    const showResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => (b.textContent || '').trim() === 'הצג');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(5000);
    try {
        const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 30000 }),
            cdp.send("Runtime.evaluate", {
                expression: `(function() {
        // לפי img alt או src
        const img = document.querySelector('img[alt="יצא לאקסל"], img[src*="EXEL"], img[src*="excel"]');
        if (!img) return 'IMG_NOT_FOUND';
        
        // נסה div[role="link"] שמכיל את ה-img
        const divLink = img.closest('div[role="link"]');
        if (divLink) { divLink.click(); return 'CLICKED_DIV'; }
        
        // נסה a רגיל
        const aLink = img.closest('a');
        if (aLink) { aLink.click(); return 'CLICKED_A'; }
        
        // לחץ ישירות על ה-img
        img.click();
        return 'CLICKED_IMG';
      })()`,
                returnByValue: true,
            }),
        ]);
        const filename = download.suggestedFilename();
        const reportKey = path.join(absDir, `${Date.now()}_${filename}`);
        await download.saveAs(reportKey);
        results.push({ reportKey, filename });
    }
    catch (e: any) {
    }
    return results;
}
