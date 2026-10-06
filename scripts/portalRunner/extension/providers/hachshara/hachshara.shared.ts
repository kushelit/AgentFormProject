import { providerAuthenticated, waitForProviderAuthentication, continueIfAuthenticated } from '../../auth-providers';
// Ported from the native provider; browser report keys replace local files.
import type { Page } from "../../browser";
import type { RunnerCtx } from "../../types";
import { reportPath as path } from "../../report-store";
export async function hachsharaLogin(page: Page, username: string, password: string) {
    if (await providerAuthenticated(page,'hachshara')) return;
    const cdp = await page.context().newCDPSession(page);
    const errorCheck = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const link = document.querySelector('a.apmui-button-submit[href="/"]');
      if (!link) return 'NO_ERROR_PAGE';
      link.click();
      return 'CLICKED_RETRY';
    })()`,
        returnByValue: true,
    });
    if (errorCheck.result.value === 'CLICKED_RETRY') {
        await page.waitForTimeout(3000);
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => { });
    }
    let usernameFound = false;
    for (let i = 0; i < 60; i++) {
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('#username') ? 'FOUND' : 'NOT_FOUND'`,
            returnByValue: true,
        });
        if (check.result.value === 'FOUND') {
            usernameFound = true;
            break;
        }
        await page.waitForTimeout(1000);
    }
    if (!usernameFound) {
        throw new Error("שדה שם המשתמש לא נטען בזמן - ייתכן שהפורטל השתנה");
    }
    await page.waitForTimeout(1500);
    let fillOk = false;
    for (let attempt = 0; attempt < 5; attempt++) {
        const fillResult = await cdp.send("Runtime.evaluate", {
            expression: `(function(u, p) {
        function fill(selector, val) {
          const el = document.querySelector(selector);
          if (!el) return false;
          el.focus();
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        }
        const uOk = fill('#username', u);
        const pOk = fill('#password', p);
        if (!uOk) return 'USER_NOT_FOUND';
        if (!pOk) return 'PASS_NOT_FOUND';
        return 'FILLED';
      })(${JSON.stringify(username)}, ${JSON.stringify(password)})`,
            returnByValue: true,
        });
        if (fillResult.exceptionDetails) {
        }
        if (fillResult.result.value !== 'FILLED') {
            await page.waitForTimeout(1000);
            continue;
        }
        await page.waitForTimeout(300);
        const readback = await cdp.send("Runtime.evaluate", {
            expression: `(function() {
        const u = document.querySelector('#username');
        const p = document.querySelector('#password');
        return JSON.stringify({ u: u ? u.value : null, p: p ? p.value : null });
      })()`,
            returnByValue: true,
        });
        const parsed = JSON.parse(readback.result.value || '{}');
        if (parsed.u === username && parsed.p === password) {
            fillOk = true;
            break;
        }
        await page.waitForTimeout(1000);
    }
    if (!fillOk) {
        throw new Error("לא הצלחנו למלא את פרטי ההתחברות - הערכים נמחקים על ידי הדף");
    }
    const submitResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btn = document.querySelector('input.apmui-button-submit');
      if (!btn) return 'BUTTON_NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
        returnByValue: true,
    });
    if (submitResult.result.value !== 'CLICKED') {
        throw new Error("כפתור ההתחברות לא נמצא");
    }
    let progressed = false;
    for (let i = 0; i < 20; i++) {
        const check = await cdp.send("Runtime.evaluate", {
            expression: `(function() {
        const otpField = document.querySelector('input[name="text"]');
        const usernameField = document.querySelector('#username');
        const urlChanged = !window.location.href.includes('/my.policy');
        if (otpField) return 'OTP_APPEARED';
        if (urlChanged) return 'URL_CHANGED';
        if (!usernameField) return 'USERNAME_GONE';
        return 'STILL_ON_LOGIN';
      })()`,
            returnByValue: true,
        });
        if (check.result.value !== 'STILL_ON_LOGIN') {
            progressed = true;
            break;
        }
        await page.waitForTimeout(1000);
    }
    if (!progressed) {
        throw new Error("ההתחברות נכשלה - נשארנו על דף הלוגין אחרי הלחיצה על כניסה");
    }
}
export async function hachsharaHandleOtp(page: Page, ctx: RunnerCtx) {
    if (await continueIfAuthenticated(page,ctx,'hachshara')) return;
    const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
    const monthLabel = run?.monthLabel || "חודש נוכחי";
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 30; i++) {
        if (await continueIfAuthenticated(page,ctx,'hachshara')) return;
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('input[name="text"]') ? 'FOUND' : 'NOT_FOUND'`,
            returnByValue: true,
        });
        if (check.result.value === 'FOUND')
            break;
        await page.waitForTimeout(1000);
    }
    await setStatus(runId, {
        status: "otp_required",
        step: "ממתין לקוד אימות מהכשרה",
        "otp.mode": "firestore",
        monthLabel,
    });
    const authentication_otp = await waitForProviderAuthentication(page,ctx,'hachshara');
    if (authentication_otp.kind === 'authenticated') return;
    const otp = authentication_otp.code;
    if (!otp)
        throw new Error("קוד ה-OTP לא התקבל");
    const result = await cdp.send("Runtime.evaluate", {
        expression: `(function(code) {
      const input = document.querySelector('input[name="text"]');
      if (!input) return 'INPUT_NOT_FOUND';
      input.focus();
      input.value = code;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      setTimeout(() => {
        const btn = document.querySelector('input.apmui-button-submit');
        if (btn) btn.click();
      }, 500);
      return 'SUCCESS';
    })(${JSON.stringify(otp)})`,
        returnByValue: true,
    });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 30; i++) {
        const check = await cdp.send("Runtime.evaluate", {
            expression: `window.location.href.includes('agents.hcsra.co.il') ? 'LOGGED_IN' : 'WAITING'`,
            returnByValue: true,
        });
        if (check.result.value === 'LOGGED_IN')
            break;
        await page.waitForTimeout(1000);
    }
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => { });
    await page.waitForTimeout(2000);
    await clearOtp(runId).catch(() => { });
}
async function hachsharaExportReport(page: Page, reportUrl: string, absDir: string, reportName: string): Promise<{
    reportKey: string;
    filename: string;
}[]> {
    const results: {
        reportKey: string;
        filename: string;
    }[] = [];
    const cdp = await page.context().newCDPSession(page);
    await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => { });
    for (let i = 0; i < 30; i++) {
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('#btn-submit') ? 'FOUND' : 'NOT_FOUND'`,
            returnByValue: true,
        });
        if (check.result.value === 'FOUND')
            break;
        await page.waitForTimeout(2000);
    }
    const generateResult = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const btn = document.querySelector('#btn-submit');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
        returnByValue: true,
    });
    let hasData = false;
    for (let i = 0; i < 60; i++) {
        const check = await cdp.send("Runtime.evaluate", {
            expression: `(function() {
        if (document.querySelector('div.no-data')) return 'NO_DATA';
        const rows = document.querySelectorAll('table tbody tr, .report-row, ag-row');
        if (rows.length > 0) return 'HAS_DATA';
        return 'LOADING';
      })()`,
            returnByValue: true,
        });
        if (check.result.value === 'NO_DATA') {
            return [];
        }
        if (check.result.value === 'HAS_DATA') {
            hasData = true;
            break;
        }
        await page.waitForTimeout(2000);
    }
    if (!hasData) {
        return [];
    }
    await page.waitForTimeout(2000);
    try {
        const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 60000 }),
            cdp.send("Runtime.evaluate", {
                expression: `(function() {
          const btns = Array.from(document.querySelectorAll('button.btn-outline-ele'));
          const btn = btns.find(b => (b.textContent || '').includes('excel'));
          if (!btn) return 'NOT_FOUND';
          btn.click();
          return 'CLICKED';
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
export async function hachsharaNavigateAndExport(page: Page, absDir: string): Promise<{
    reportKey: string;
    filename: string;
    templateId: string;
}[]> {
    const results: {
        reportKey: string;
        filename: string;
        templateId: string;
    }[] = [];
    const REPORTS = [
        {
            templateId: "hacshara_insurance",
            label: "ריסקים נפרעים",
            url: "https://agents.hcsra.co.il/reports/151",
        },
        {
            templateId: "hacshara_zvira",
            label: "בסט אינווסט נפרעים",
            url: "https://agents.hcsra.co.il/reports/152",
        },
    ];
    for (const rep of REPORTS) {
        try {
            const files = await hachsharaExportReport(page, rep.url, absDir, rep.label);
            for (const f of files) {
                results.push({ ...f, templateId: rep.templateId });
            }
        }
        catch (e: any) {
        }
    }
    return results;
}
