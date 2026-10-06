// Ported from the native provider; browser report keys replace local files.
import type { Page } from "../../browser";
import type { RunnerCtx } from "../../types";
import { reportPath as path } from "../../report-store";
import { waitForPortalAuthentication } from '../../auth-flow';
async function harelAuthenticated(page: Page) {
    return page.evaluate(() => location.hostname.endsWith('harel-group.co.il') &&
      /^\/Information\//i.test(location.pathname) &&
      !document.querySelector('#input_1, input[name="otpass"]')).catch(() => false);
}
export async function harelLogin(page: Page, username: string, password: string) {
    if (await harelAuthenticated(page)) return;
    const cdp = await page.context().newCDPSession(page);
    const errorCheck = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
      const link = document.querySelector('a[href="/"]');
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
    for (let i = 0; i < 20; i++) {
        if (await harelAuthenticated(page)) return;
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('#input_1') ? 'FOUND' : 'NOT_FOUND'`,
            returnByValue: true,
        });
        if (check.result.value === 'FOUND')
            break;
        await page.waitForTimeout(1000);
    }
    await cdp.send("Runtime.evaluate", {
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
      const uOk = fill('#input_1', u);
      const pOk = fill('#input_2', p);
      if (!uOk) return 'USER_NOT_FOUND';
      if (!pOk) return 'PASS_NOT_FOUND';
      const u1 = document.querySelector('#input_1')?.value;
      const p1 = document.querySelector('#input_2')?.value;
      setTimeout(() => {
        const btn = document.querySelector('.credentials_input_submit');
        if (btn) btn.click();
      }, 500);
      return 'SUCCESS: user=' + u1 + ' pass_len=' + (p1 ? p1.length : 0);
    })(${JSON.stringify(username)}, ${JSON.stringify(password)})`,
        returnByValue: true,
    });
}
export async function harelHandleOtp(page: Page, ctx: RunnerCtx) {
    const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
    const monthLabel = run?.monthLabel || "חודש נוכחי";
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 30; i++) {
        if (await harelAuthenticated(page)) {await clearOtp(runId);return;}
        const check = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelector('input[name="otpass"]') ? 'FOUND' : 'NOT_FOUND'`,
            returnByValue: true,
        });
        if (check.result.value === 'FOUND')
            break;
        await page.waitForTimeout(1000);
    }
    const otpCheck = await cdp.send("Runtime.evaluate", {
        expression: `document.querySelector('input[name="otpass"]') ? 'FOUND' : 'NOT_FOUND'`,
        returnByValue: true,
    });
    if (otpCheck.result.value !== 'FOUND') {
        throw new Error('Login failed - OTP screen not reached');
    }
    await setStatus(runId, {
        status: "otp_required",
        step: "ממתין לקוד אימות מהראל",
        "otp.mode": "firestore",
        monthLabel,
    });
    const authentication = await waitForPortalAuthentication(page,ctx,()=>harelAuthenticated(page));
    if (authentication.kind === 'authenticated') return;
    const otp = authentication.code;
    if (!otp)
        throw new Error("קוד ה-OTP לא התקבל");
    await cdp.send("Runtime.evaluate", {
        expression: `(function(code) {
      const input = document.querySelector('input[name="otpass"]');
      if (!input) return 'INPUT_NOT_FOUND';
      input.focus();
      input.value = code;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      setTimeout(() => {
        const btn = document.querySelector('.credentials_input_submit');
        if (btn) btn.click();
      }, 500);
      return 'SUCCESS';
    })(${JSON.stringify(otp)})`,
        returnByValue: true,
    });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 20; i++) {
        const check = await cdp.send("Runtime.evaluate", {
            expression: `window.location.href.includes('default.aspx') ? 'LOGGED_IN' : 'WAITING'`,
            returnByValue: true,
        });
        if (check.result.value === 'LOGGED_IN')
            break;
        await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(5000);
    await clearOtp(runId).catch(() => { });
}
export async function harelNavigateToReport(page: Page, absDir: string): Promise<{
    reportKey: string;
    filename: string;
}[]> {
    const results: {
        reportKey: string;
        filename: string;
    }[] = [];
    const reportUrl = "https://agents-int.harel-group.co.il/Information/Reports/life-health-saving/Agent/Pages/commissions/payments-assembly.aspx";
    await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => { });
    let frame: ReturnType<Page['frames']>[number] | undefined;
    for (let i = 0; i < 60; i++) {
        frame = page.frames().find(f => f.url().includes('_layouts/15/H'));
        if (frame) {
            const check = await frame.evaluate(`document.querySelector('th[data_colid="Schum_Nifraim"]') ? 'FOUND' : 'NOT_FOUND'`).catch(() => 'ERROR');
            if (check === 'FOUND')
                break;
        }
        else {
        }
        if (i === 7) {
            await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => { });
            await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => { });
        }
        await page.waitForTimeout(2000);
    }
    if (!frame)
        throw new Error("Frame לא נמצא");
    const clickResult = await frame.evaluate(`(function() {
    const th = document.querySelector('th[data_colid="Schum_Nifraim"]');
    if (!th) return 'TH_NOT_FOUND';
    const table = th.closest('table');
    if (!table) return 'TABLE_NOT_FOUND';
    const colIndex = Array.from(table.querySelectorAll('th')).findIndex(t => t.getAttribute('data_colid') === 'Schum_Nifraim');
    const firstRow = table.querySelector('tbody tr');
    if (!firstRow) return 'ROW_NOT_FOUND';
    const cell = firstRow.querySelectorAll('td')[colIndex];
    if (!cell) return 'CELL_NOT_FOUND';
    cell.click();
    return 'CLICKED: ' + cell.textContent?.trim();
  })()`);
    for (let i = 0; i < 20; i++) {
        const check = await frame.evaluate(`document.querySelector('td[data_colid="_M2_Schum"].cell_action') ? 'FOUND' : 'NOT_FOUND'`).catch(() => 'ERROR');
        if (check === 'FOUND')
            break;
        await page.waitForTimeout(1000);
    }
    const [newPage] = await Promise.all([
        page.context().waitForEvent("page", { timeout: 120000 }),
        frame.evaluate(`(function() {
      const cell = document.querySelector('td[data_colid="_M2_Schum"].cell_action');
      if (!cell) return 'NOT_FOUND';
      cell.click();
      return 'CLICKED: ' + cell.getAttribute('data-title') + ' = ' + cell.textContent?.trim();
    })()`)
    ]);
    await newPage.bringToFront();
    await newPage.waitForLoadState("domcontentloaded", { timeout: 120000 }).catch(() => { });
    let reportFrame: ReturnType<Page['frames']>[number] | undefined;
    for (let i = 0; i < 60; i++) {
        reportFrame = newPage.frames().find(f => f.url().includes('OAOAnalysis'));
        if (reportFrame) {
            break;
        }
        await newPage.waitForTimeout(2000);
    }
    if (!reportFrame)
        throw new Error("Report frame לא נמצא");
    for (let i = 0; i < 60; i++) {
        const check = await reportFrame.evaluate(`document.querySelectorAll('div.ctrlbutton.cbo').length >= 3 ? 'READY' : 'NOT_READY'`).catch(() => 'ERROR');
        if (check === 'READY')
            break;
        await newPage.waitForTimeout(2000);
    }
    await reportFrame.evaluate(`(function() {
    const btn = document.querySelectorAll('div.ctrlbutton.cbo')[2];
    if (!btn) return 'NOT_FOUND';
    ['mousedown', 'mouseup', 'click'].forEach(evt =>
      btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
    );
    return 'CLICKED';
  })()`);
    for (let i = 0; i < 20; i++) {
        const check = await reportFrame.evaluate(`document.querySelector('div.selectall') ? 'FOUND' : 'NOT_FOUND'`).catch(() => 'ERROR');
        if (check === 'FOUND')
            break;
        await newPage.waitForTimeout(1000);
    }
    const selectAllResult = await reportFrame.evaluate(`(function() {
    const el = document.querySelector('div.selectall');
    if (!el) return 'NOT_FOUND';
    ['mousedown', 'mouseup', 'click'].forEach(evt =>
      el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
    );
    return 'CLICKED';
  })()`);
    await newPage.waitForTimeout(1000);
    const filterResult = await reportFrame.evaluate(`(function() {
    let btn = document.querySelector('#H_InlineFilters_Apply_2');
    if (!btn) btn = document.querySelector('.filter-apply.click-enter');
    if (!btn) return 'NOT_FOUND';
    ['mousedown', 'mouseup', 'click'].forEach(evt =>
      btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
    );
    return 'CLICKED: ' + btn.textContent?.trim();
  })()`);
    await newPage.waitForTimeout(3000);
    await newPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => { });
    try {
        const [download] = await Promise.all([
            newPage.waitForEvent("download", { timeout: 60000 }),
            reportFrame.evaluate(`(function() {
        const btn = document.querySelector('.bar-excel');
        if (!btn) return 'NOT_FOUND';
        ['mousedown', 'mouseup', 'click'].forEach(evt =>
          btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
        );
        return 'CLICKED';
      })()`)
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
async function getCenterInFrame(filterFrame: any, jsElementExpr: string): Promise<{
    x: number;
    y: number;
} | null> {
    return await filterFrame.evaluate(`(function() {
    const el = ${jsElementExpr};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`).catch(() => null);
}
async function getFrameOffset(newPage: any): Promise<{
    x: number;
    y: number;
}> {
    const rect = await newPage.evaluate(`(function() {
    const frames = Array.from(document.querySelectorAll('iframe'));
    const f = frames.find((f) => f.src && f.src.includes('OAOAnalysis'));
    if (!f) return null;
    const r = f.getBoundingClientRect();
    return { x: r.left, y: r.top };
  })()`).catch(() => null);
    return { x: rect?.x || 0, y: rect?.y || 0 };
}
async function clickElementInFrame(newPage: any, filterFrame: any, jsElementExpr: string, label = ''): Promise<boolean> {
    const center = await getCenterInFrame(filterFrame, jsElementExpr);
    if (!center) {
        return false;
    }
    const offset = await getFrameOffset(newPage);
    const absX = offset.x + center.x;
    const absY = offset.y + center.y;
    await newPage.mouse.move(absX, absY);
    await newPage.mouse.click(absX, absY);
    return true;
}
async function openComboAndSelectAll(newPage: any, filterFrame: any, comboElementExpr: string, label: string): Promise<boolean> {
    for (let attempt = 1; attempt <= 4; attempt++) {
        const opened = await clickElementInFrame(newPage, filterFrame, comboElementExpr, `open ${label} (ניסיון ${attempt})`);
        if (!opened) {
            return false;
        }
        let found = false;
        for (let i = 0; i < 10; i++) {
            const count: number = await filterFrame
                .evaluate(`document.querySelectorAll('div.selectall').length`)
                .catch(() => 0);
            if (count > 0) {
                found = true;
                break;
            }
            await newPage.waitForTimeout(500);
        }
        if (found) {
            const ok = await clickElementInFrame(newPage, filterFrame, `(function(){ const items = document.querySelectorAll('div.selectall'); return items[items.length - 1]; })()`, `select-all ${label}`);
            if (ok) {
                return true;
            }
        }
    }
    return false;
}
async function clickAndVerify(page: Page, frame: any, clickExpr: string, verifyExpr: string, label: string, maxAttempts = 3, verifyTimeoutMs = 8000): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const clickResult = await frame.evaluate(clickExpr).catch(() => 'ERROR');
        if (clickResult === 'NOT_FOUND' || clickResult === 'ERROR') {
            await page.waitForTimeout(1000);
            continue;
        }
        const start = Date.now();
        while (Date.now() - start < verifyTimeoutMs) {
            const check = await frame.evaluate(verifyExpr).catch(() => 'ERROR');
            if (check === 'FOUND') {
                return true;
            }
            await page.waitForTimeout(500);
        }
    }
    return false;
}
export async function harelNavigateToTzviraReport(page: Page, absDir: string, _ctx?: RunnerCtx): Promise<{
    reportKey: string;
    filename: string;
}[]> {
    const results: {
        reportKey: string;
        filename: string;
    }[] = [];
    const reportUrl = "https://agents-int.harel-group.co.il/Information/Reports/life-health-saving/Agent/Pages/commissions/payments-assembly.aspx";
    await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => { });
    let frame: ReturnType<Page['frames']>[number] | undefined;
    for (let i = 0; i < 60; i++) {
        frame = page.frames().find(f => f.url().includes('_layouts/15/H'));
        if (frame) {
            const check = await frame.evaluate(`document.querySelector('th[data_colid="Schum_Mutzarim_Finnasim"]') ? 'FOUND' : 'NOT_FOUND'`).catch(() => 'ERROR');
            if (check === 'FOUND') {
                break;
            }
        }
        if (i === 7) {
            await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => { });
            await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => { });
        }
        await page.waitForTimeout(2000);
    }
    if (!frame)
        throw new Error("[Harel][Tzvira] שלב 1: ה-frame הראשי לא נמצא");
    const step2_3Ok = await clickAndVerify(page, frame, `(function() {
      const th = document.querySelector('th[data_colid="Schum_Mutzarim_Finnasim"]');
      if (!th) return 'NOT_FOUND';
      const table = th.closest('table');
      if (!table) return 'NOT_FOUND';
      const colIndex = Array.from(table.querySelectorAll('th')).findIndex(t => t.getAttribute('data_colid') === 'Schum_Mutzarim_Finnasim');
      const firstRow = table.querySelector('tbody tr');
      if (!firstRow) return 'NOT_FOUND';
      const cell = firstRow.querySelectorAll('td')[colIndex];
      if (!cell) return 'NOT_FOUND';
      cell.click();
      return 'CLICKED';
    })()`, `document.querySelector('td[data_colid="_M2_Schum_2"].cell_action') ? 'FOUND' : 'NOT_FOUND'`, 'שלב 2-3');
    if (!step2_3Ok)
        throw new Error("[Harel][Tzvira] שלב 2-3: לא הצלחנו לפתוח את המודל הראשון אחרי כל הניסיונות");
    const step4_5Ok = await clickAndVerify(page, frame, `(function() {
      const cell = document.querySelector('td[data_colid="_M2_Schum_2"].cell_action');
      if (!cell) return 'NOT_FOUND';
      cell.click();
      return 'CLICKED';
    })()`, `document.querySelectorAll('td[data_colid="_M2_Schum_2"].cell_action').length >= 2 ? 'FOUND' : 'NOT_FOUND'`, 'שלב 4-5');
    if (!step4_5Ok)
        throw new Error("[Harel][Tzvira] שלב 4-5: לא הצלחנו לפתוח את המודל השני אחרי כל הניסיונות");
    const [newPage] = await Promise.all([
        page.context().waitForEvent("page", { timeout: 120000 }),
        frame.evaluate(`(function() {
      const cells = document.querySelectorAll('td[data_colid="_M2_Schum_2"].cell_action');
      const cell = cells[cells.length - 1];
      if (!cell) return 'NOT_FOUND';
      cell.click();
      return 'CLICKED: ' + cell.getAttribute('data-title') + ' = ' + cell.textContent?.trim();
    })()`)
    ]);
    await newPage.bringToFront();
    await newPage.waitForLoadState("domcontentloaded", { timeout: 120000 }).catch(() => { });
    await newPage.waitForTimeout(3000);
    let filterFrame: ReturnType<Page['frames']>[number] | undefined;
    for (let i = 0; i < 60; i++) {
        filterFrame = newPage.frames().find(f => f.url().includes('OAOAnalysis'));
        if (filterFrame) {
            const check = await filterFrame.evaluate(`document.querySelector('#_ctrlParam__4') ? 'FOUND' : 'NOT_FOUND'`).catch(() => 'ERROR');
            if (check === 'FOUND') {
                break;
            }
        }
        await newPage.waitForTimeout(2000);
    }
    if (!filterFrame)
        throw new Error("[Harel][Tzvira] שלב 7: filter frame לא נמצא");
    await newPage.waitForTimeout(1500);
    const clearOk = await clickElementInFrame(newPage, filterFrame, `document.querySelector('#H_InlineFilters_Clear_2')`, 'שלב 7.5 (אפס מסנן)');
    await newPage.waitForTimeout(2000);
    const step8Ok = await openComboAndSelectAll(newPage, filterFrame, `document.querySelector('#_ctrlParam__4 .ctrlbutton.cbo')`, 'שלב 8 (חברה מנהלת)');
    if (!step8Ok) {
    }
    await newPage.waitForTimeout(500);
    const step9Ok = await openComboAndSelectAll(newPage, filterFrame, `document.querySelector('#_ctrlParam__3 .ctrlbutton.cbo')`, 'שלב 9 (סוכן)');
    if (!step9Ok) {
    }
    await newPage.waitForTimeout(1000);
    const filterOk = await clickElementInFrame(newPage, filterFrame, `(function(){ return document.querySelector('#H_InlineFilters_Apply_2') || document.querySelector('.filter-apply.click-enter'); })()`, 'שלב 11 (סנן מידע)');
    await newPage.waitForTimeout(10000);
    await newPage.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => { });
    await newPage.waitForTimeout(5000);
    try {
        const [download] = await Promise.all([
            newPage.waitForEvent("download", { timeout: 60000 }),
            clickElementInFrame(newPage, filterFrame, `document.querySelector('.bar-excel')`, 'שלב 12 (הורד אקסל)'),
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
