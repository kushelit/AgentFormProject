// Ported from the native provider; browser report keys replace local files.
import type { Page } from "../../browser";
import type { RunnerCtx } from "../../types";
import { reportPath as path } from "../../report-store";
import { waitForPortalAuthentication } from '../../auth-flow';
async function meitavAuthenticated(page: Page) {
    return page.evaluate(() => {
        const logout = document.querySelector('a.lnkLogOut');
        return (location.hostname === 'meitav.co.il' || location.hostname.endsWith('.meitav.co.il')) &&
          !!logout?.getClientRects().length;
    }).catch(() => false);
}
export async function meitavLogin(page: Page, idNumber: string, fullPhone: string) {
    if (await meitavAuthenticated(page)) return;
    const prefix = fullPhone.substring(0, 3);
    const suffix = fullPhone.substring(3);
    const cdp = await page.context().newCDPSession(page);
    const fillResult = await cdp.send("Runtime.evaluate", {
        expression: `(function(id, pref, phone) {
      const idInput = document.querySelector('#id-identity-input, input[name="identity"]');
      const prefSelect = document.querySelector('select[name="prefixPhone"]');
      const phoneInput = document.querySelector('input[name="phoneNumber"]');

      if (!idInput) return 'ID_INPUT_NOT_FOUND';
      if (!prefSelect) return 'PREFIX_SELECT_NOT_FOUND';
      if (!phoneInput) return 'PHONE_INPUT_NOT_FOUND';

      // מילוי ת"ז
      idInput.focus();
      idInput.value = id;
      idInput.dispatchEvent(new Event('input', { bubbles: true }));
      idInput.dispatchEvent(new Event('change', { bubbles: true }));
      idInput.dispatchEvent(new Event('blur', { bubbles: true }));

      // בחירת קידומת
      prefSelect.value = pref;
      prefSelect.dispatchEvent(new Event('change', { bubbles: true }));

      // מילוי 7 ספרות
      phoneInput.focus();
      phoneInput.value = phone;
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
      phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
      phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));

      const btn = document.querySelector('button[type="submit"]');
      setTimeout(() => { if (btn) btn.click(); }, 600);

      return 'SUCCESS: id=' + idInput.value + ' prefix=' + prefSelect.value + ' phone=' + phoneInput.value;
    })('${idNumber}', '${prefix}', '${suffix}')`,
        returnByValue: true,
    });
    if (!fillResult.result.value?.toString().startsWith('SUCCESS')) {
        throw new Error(`Login fields filling failed: ${fillResult.result.value}`);
    }
    let errorText: string | null = null;
    for (let i = 0; i < 10; i++) {
        errorText = await meitavGetLoginErrorText(cdp);
        if (errorText)
            break;
        await page.waitForTimeout(1000).catch(() => { });
    }
    if (errorText) {
        throw new Error(`מיטב: פרטי ההתחברות שגויים - הפורטל הציג "${errorText}"`);
    }
}
async function meitavGetLoginErrorText(cdp: any): Promise<string | null> {
    const check = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      if (document.getElementById('LoginNoMatch') || location.href.includes('loginNoMatch')) {
        return 'הפרטים שהוזנו אינם תואמים את המידע הקיים במערכת';
      }
      const el = document.querySelector('.errorLabel[role="alert"]');
      if (el && el.offsetParent !== null) {
        const txt = (el.innerText || el.textContent || '').trim();
        if (txt) return txt;
      }
      return null;
    })()`,
        returnByValue: true,
    });
    return check.result.value || null;
}
async function meitavHasOtpError(cdp: any): Promise<boolean> {
    const check = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const el = document.querySelector('.errorLabel[role="alert"]');
      if (!el) return false;
      const visible = el.offsetParent !== null;
      const txt = (el.innerText || el.textContent || '').trim();
      return visible && txt.includes('הקוד שהזנת שגוי');
    })()`,
        returnByValue: true,
    });
    return check.result.value === true;
}
async function injectMeitavOtpCode(cdp: any, page: Page, otp: string) {
    const inputPos = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const input = document.querySelector('#codeDigitsInput, input[name="codeDigitsInput"]');
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
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
    await page.keyboard.type(otp, { delay: 150 });
    await page.waitForTimeout(500);
    await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btn = document.querySelector('button[ng-click="confirmPassword()"], button[type="submit"]');
      if (!btn) return 'BTN_NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
        returnByValue: true,
    });
}
async function meitavClearOtpErrorMarker(cdp: any) {
    await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const el = document.querySelector('.errorLabel[role="alert"]');
      if (el) el.textContent = '';
    })()`,
        returnByValue: true,
    }).catch(() => { });
}
async function waitForMeitavOtpDone(cdp: any, page: Page, timeoutMs = 15000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const check = await cdp.send("Runtime.evaluate", {
                expression: `(function() {
          if (document.querySelector('a.lnkLogOut')) return true;
          if (!document.querySelector('#codeDigitsInput, input[name="codeDigitsInput"]')) return true;
          const el = document.querySelector('.errorLabel[role="alert"]');
          if (el && el.offsetParent !== null) {
            const txt = (el.innerText || el.textContent || '').trim();
            if (txt.includes('הקוד שהזנת שגוי')) return true;
          }
          return false;
        })()`,
                returnByValue: true,
            });
            if (check.result.value === true)
                return true;
        }
        catch (e) {
        }
        await page.waitForTimeout(500).catch(() => { });
    }
    return false;
}
export async function meitavHandleOtp(page: Page, ctx: RunnerCtx) {
    const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
    const monthLabel = run?.monthLabel || "חודש נוכחי";
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 30; i++) {
        if (await meitavAuthenticated(page)) {
            await clearOtp(runId);
            await setStatus(runId,{status:'running',step:'portal_authentication_confirmed','otp.state':'none','otp.value':''});
            return;
        }
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('#codeDigitsInput, input[name="codeDigitsInput"]') ? 'FOUND' : 'NOT_FOUND'`,
            returnByValue: true,
        });
        if (check.result.value === 'FOUND')
            break;
        await page.waitForTimeout(1000);
    }
    await setStatus(runId, {
        status: "otp_required",
        step: "ממתין לקוד אימות ממיטב",
        "otp.mode": "firestore",
        monthLabel,
    });
    let authentication = await waitForPortalAuthentication(page,ctx,()=>meitavAuthenticated(page));
    if (authentication.kind === 'authenticated') return;
    let otp = authentication.code;
    if (!otp)
        throw new Error("קוד ה-OTP לא התקבל");
    await setStatus(runId, { status: "running", step: "הקוד התקבל, מתחבר למערכת...", "otp.mode": "firestore", monthLabel });
    await injectMeitavOtpCode(cdp, page, otp);
    await waitForMeitavOtpDone(cdp, page, 15000);
    const hasError = await meitavHasOtpError(cdp);
    await clearOtp(runId).catch(() => { });
    if (hasError) {
        await setStatus(runId, {
            status: "otp_required",
            step: "הקוד הקודם היה שגוי - נסה שוב",
            "otp.mode": "firestore",
            monthLabel,
        });
        authentication = await waitForPortalAuthentication(page,ctx,()=>meitavAuthenticated(page));
        if (authentication.kind === 'authenticated') return;
        otp = authentication.code;
        if (!otp)
            throw new Error("OTP Timeout (ניסיון שני)");
        await setStatus(runId, { status: "running", step: "הקוד התקבל, מתחבר למערכת...", "otp.mode": "firestore", monthLabel });
        await meitavClearOtpErrorMarker(cdp);
        await injectMeitavOtpCode(cdp, page, otp);
        await waitForMeitavOtpDone(cdp, page, 15000);
        const stillError = await meitavHasOtpError(cdp);
        await clearOtp(runId).catch(() => { });
        if (stillError) {
            throw new Error('מיטב: קוד הזיהוי שגוי גם בניסיון השני - הפורטל הציג "הקוד שהזנת שגוי, יש להזין את הקוד בשנית"');
        }
    }
    const deadline = Date.now()+15000;
    while (!await meitavAuthenticated(page)) {
        if (Date.now()>=deadline) throw new Error('MEITAV_AUTHENTICATION_NOT_CONFIRMED');
        await page.waitForTimeout(500);
    }
    await setStatus(runId, { status: "running", step: "קוד אומת בהצלחה, ממשיך...", monthLabel });
    await page.waitForTimeout(5000);
}
export async function meitavNavigateAndExport(page: Page, absDir: string, requestedReportMonth?: string, includeCodes: string[] = []): Promise<{
    reportKey: string;
    filename: string;
    agentName: string;
    failed?: boolean;
    failReason?: string;
}[]> {
    const results: {
        reportKey: string;
        filename: string;
        agentName: string;
        failed?: boolean;
        failReason?: string;
    }[] = [];
    const includeSet = new Set(includeCodes);
    const cdp = await page.context().newCDPSession(page);
    let prevMonthNum: string;
    let prevYear: string;
    if (requestedReportMonth) {
        const [y, m] = requestedReportMonth.split('-');
        prevYear = y;
        prevMonthNum = String(Number(m));
    }
    else {
        const now = new Date();
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        prevMonthNum = String(prevMonth.getMonth() + 1);
        prevYear = String(prevMonth.getFullYear());
    }
    async function getPos(selector: string) {
        const result = await cdp.send("Runtime.evaluate", {
            expression: `(function() {
        const el = document.querySelector('${selector}');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
      })()`,
            returnByValue: true,
        });
        return JSON.parse(result.result.value || 'null');
    }
    async function openAndSelectByValue(selector: string, dataValue: string, label: string) {
        const pos = await getPos(selector);
        if (!pos) {
            return false;
        }
        await page.mouse.click(pos.x, pos.y);
        await page.waitForTimeout(1000);
        const result = await cdp.send("Runtime.evaluate", {
            expression: `(function(val) {
        const options = Array.from(document.querySelectorAll('[role="option"]'));
        const target = options.find(o => o.getAttribute('data-value') === val);
        if (!target) return 'NOT_FOUND: ' + options.map(o => o.getAttribute('data-value')).join(' | ');
        target.click();
        return 'CLICKED: ' + target.textContent?.trim();
      })('${dataValue}')`,
            returnByValue: true,
        });
        await page.waitForTimeout(500);
        return true;
    }
    const navResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const links = Array.from(document.querySelectorAll('a'));
     const target = links.find(a => (a.href || '').includes('/agentamlot'));
      if (!target) return 'NOT_FOUND';
      target.click();
      return 'CLICKED: ' + target.href;
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(5000);
    await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return 'NO_DIALOG';
      const btn = dialog.querySelector('button');
      if (btn) { btn.click(); return 'CLOSED'; }
      return 'NO_BTN';
    })()`,
        returnByValue: true,
    });
    await page.waitForTimeout(1000);
    const agentPos = await getPos('#selectedAgent');
    if (!agentPos)
        throw new Error("Agent input not found");
    await page.mouse.click(agentPos.x, agentPos.y);
    await page.waitForTimeout(1500);
    const agentsList = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const listbox = document.querySelector('#selectedAgent-listbox');
      if (!listbox) return '[]';
      const items = Array.from(listbox.querySelectorAll('li, [role="option"]'));
      return JSON.stringify(items.map(i => i.textContent?.trim()));
    })()`,
        returnByValue: true,
    });
    const agents: string[] = JSON.parse(agentsList.result.value || '[]');
    if (agents.length === 0)
        throw new Error("No agents found");
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    for (let i = 0; i < agents.length; i++) {
        const agentName = agents[i];
        const codeMatch = agentName.match(/\(([^)]+)\)/);
        const agentCode = codeMatch ? codeMatch[1].trim() : null;
        if (includeSet.size > 0 && (!agentCode || !includeSet.has(agentCode))) {
            continue;
        }
        await page.mouse.click(agentPos.x, agentPos.y);
        await page.waitForTimeout(500);
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(500);
        const selectResult = await cdp.send("Runtime.evaluate", {
            expression: `(function(idx) {
        const listbox = document.querySelector('#selectedAgent-listbox');
        if (!listbox) return 'NO_LISTBOX';
        const items = Array.from(listbox.querySelectorAll('li, [role="option"]'));
        if (!items[idx]) return 'NO_ITEM_' + idx;
        items[idx].click();
        return 'CLICKED: ' + items[idx].textContent?.trim();
      })(${i})`,
            returnByValue: true,
        });
        await page.waitForTimeout(1000);
        await openAndSelectByValue('#selectReportType', '102', 'Report type');
        await openAndSelectByValue('#selectedYear', prevYear, 'Year');
        await openAndSelectByValue('#selectedMonth', prevMonthNum, 'Month');
        const searchBtnPos = await getPos('.col-md-2.searchBtn');
        if (!searchBtnPos) {
            await cdp.send("Runtime.evaluate", {
                expression: `(function() {
          const divs = Array.from(document.querySelectorAll('div'));
          const btn = divs.find(d => (d.textContent || '').trim().includes('הצג דוחות'));
          if (btn) btn.click();
        })()`,
                returnByValue: true,
            });
        }
        else {
            await page.mouse.click(searchBtnPos.x, searchBtnPos.y);
        }
        await page.waitForTimeout(5000);
        for (let w = 0; w < 15; w++) {
            const check = await cdp.send("Runtime.evaluate", {
                expression: `document.querySelector('div.resDownload') ? 'FOUND' : 'NOT_FOUND'`,
                returnByValue: true,
            });
            if (check.result.value === 'FOUND')
                break;
            await page.waitForTimeout(1000);
        }
        await page.waitForTimeout(2000);
        try {
            const [download] = await Promise.all([
                page.waitForEvent("download", { timeout: 30000 }),
                cdp.send("Runtime.evaluate", {
                    expression: `(function() {
            const btn = document.querySelector('div.resDownload');
            if (!btn) return 'NOT_FOUND';
            btn.click();
            return 'CLICKED: ' + btn.textContent?.trim();
          })()`,
                    returnByValue: true,
                }),
            ]);
            const filename = download.suggestedFilename();
            const reportKey = path.join(absDir, `${Date.now()}_${filename}`);
            await download.saveAs(reportKey);
            results.push({ reportKey, filename, agentName });
        }
        catch (e: any) {
            results.push({ reportKey: '', filename: '', agentName, failed: true, failReason: String(e?.message || 'download_failed') });
        }
        await page.waitForTimeout(1000);
    }
    return results;
}
