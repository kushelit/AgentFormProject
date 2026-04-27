import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";
import path from "path";

export async function harelLogin(page: Page, username: string, password: string) {
  console.log("[Harel] Checking for error page...");
  const cdp = await page.context().newCDPSession(page);

  // ✅ שלב 0: אם יש דף שגיאה - לחץ "לחץ כאן"
  const errorCheck = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const link = document.querySelector('a[href="/"]');
      if (!link) return 'NO_ERROR_PAGE';
      link.click();
      return 'CLICKED_RETRY';
    })()`,
    returnByValue: true,
  });
  console.log("[Harel] Error page check:", errorCheck.result.value);

  if (errorCheck.result.value === 'CLICKED_RETRY') {
    await page.waitForTimeout(3000);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  // ✅ שלב 1: המתנה לשדות הלוגין
  console.log("[Harel] Waiting for login fields...");
  for (let i = 0; i < 20; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('#input_1') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    console.log(`[Harel] Login field check ${i + 1}:`, check.result.value);
    if (check.result.value === 'FOUND') break;
    await page.waitForTimeout(1000);
  }

  // ✅ שלב 2: מלא שדות ולחץ אישור
  const result = await cdp.send("Runtime.evaluate", {
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
      setTimeout(() => {
        const btn = document.querySelector('.credentials_input_submit');
        if (btn) btn.click();
      }, 500);
      return 'SUCCESS';
    })('${username}', '${password}')`,
    returnByValue: true,
  });

  console.log("[Harel] Login result:", result.result.value);
}

export async function harelHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";
  const cdp = await page.context().newCDPSession(page);

  console.log("[Harel] Waiting for OTP screen...");
  for (let i = 0; i < 30; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('input[name="otpass"]') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    console.log(`[Harel] OTP check ${i + 1}:`, check.result.value);
    if (check.result.value === 'FOUND') break;
    await page.waitForTimeout(1000);
  }

  await setStatus(runId, {
    status: "otp_required",
    step: "ממתין לקוד אימות מהראל",
    "otp.mode": "firestore",
    monthLabel,
  });

  const otp = await pollOtp(runId);
  if (!otp) throw new Error("קוד ה-OTP לא התקבל");
  console.log("[Harel] OTP received:", otp);

  const result = await cdp.send("Runtime.evaluate", {
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
    })('${otp}')`,
    returnByValue: true,
  });

  console.log("[Harel] OTP result:", result.result.value);

  await page.waitForTimeout(3000);
  for (let i = 0; i < 20; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `window.location.href.includes('default.aspx') ? 'LOGGED_IN' : 'WAITING'`,
      returnByValue: true,
    });
    console.log(`[Harel] Login verify ${i + 1}:`, check.result.value);
    if (check.result.value === 'LOGGED_IN') break;
    await page.waitForTimeout(1000);
  }

  await clearOtp(runId).catch(() => {});
}

export async function harelNavigateToReport(
  page: Page,
  absDir: string
): Promise<{ localPath: string; filename: string }[]> {
  const results: { localPath: string; filename: string }[] = [];
  const reportUrl = "https://agents-int.harel-group.co.il/Information/Reports/life-health-saving/Agent/Pages/commissions/payments-assembly.aspx";

  console.log("[Harel] Navigating to report page...");
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});

  // ✅ שלב 1: המתן שה-frame עם הטבלה יטען
  console.log("[Harel] Waiting for frame with table...");
  let frame = null;
  for (let i = 0; i < 60; i++) {
    frame = page.frames().find(f => f.url().includes('_layouts/15/H'));
    if (frame) {
      const check = await frame.evaluate(
        `document.querySelector('th[data_colid="Schum_Nifraim"]') ? 'FOUND' : 'NOT_FOUND'`
      ).catch(() => 'ERROR');
      console.log(`[Harel] Table check ${i + 1}:`, check);
      if (check === 'FOUND') break;
    } else {
      console.log(`[Harel] Table check ${i + 1}: frame not found yet`);
    }
    await page.waitForTimeout(2000);
  }

  if (!frame) throw new Error("Frame לא נמצא");

  // ✅ שלב 2: לחץ על "נפרעים" בשורה הראשונה
  console.log("[Harel] Clicking first row נפרעים...");
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
  console.log("[Harel] Click result:", clickResult);

  // ✅ שלב 3: המתן ל-modal נפרעים
  console.log("[Harel] Waiting for נפרעים modal...");
  for (let i = 0; i < 20; i++) {
    const check = await frame.evaluate(
      `document.querySelector('td[data_colid="_M2_Schum"].cell_action') ? 'FOUND' : 'NOT_FOUND'`
    ).catch(() => 'ERROR');
    console.log(`[Harel] Modal check ${i + 1}:`, check);
    if (check === 'FOUND') break;
    await page.waitForTimeout(1000);
  }

  // ✅ שלב 4: לחץ על תא החודש - וחכה לטאב חדש
  console.log("[Harel] Clicking month cell - waiting for new tab...");
  const [newPage] = await Promise.all([
    page.context().waitForEvent("page", { timeout: 120000 }),
    frame.evaluate(`(function() {
      const cell = document.querySelector('td[data_colid="_M2_Schum"].cell_action');
      if (!cell) return 'NOT_FOUND';
      cell.click();
      return 'CLICKED: ' + cell.getAttribute('data-title') + ' = ' + cell.textContent?.trim();
    })()`)
  ]);

  console.log("[Harel] New tab opened:", newPage.url());
  await newPage.bringToFront();
  await newPage.waitForLoadState("domcontentloaded", { timeout: 120000 }).catch(() => {});

  // ✅ שלב 5: המתן שה-frame OAOAnalysis יטען בטאב החדש
  console.log("[Harel] Waiting for report frame in new tab...");
  let reportFrame = null;
  for (let i = 0; i < 60; i++) {
    reportFrame = newPage.frames().find(f => f.url().includes('OAOAnalysis'));
    if (reportFrame) {
      console.log(`[Harel] Report frame found: ${reportFrame.url().substring(0, 80)}`);
      break;
    }
    console.log(`[Harel] Report frame check ${i + 1}: not found yet`);
    await newPage.waitForTimeout(2000);
  }

  if (!reportFrame) throw new Error("Report frame לא נמצא");

  // ✅ המתן שה-frame יהיה מוכן
  console.log("[Harel] Waiting for frame controls to be ready...");
  for (let i = 0; i < 60; i++) {
    const check = await reportFrame.evaluate(
      `document.querySelectorAll('div.ctrlbutton.cbo').length >= 3 ? 'READY' : 'NOT_READY'`
    ).catch(() => 'ERROR');
    console.log(`[Harel] Frame ready check ${i + 1}:`, check);
    if (check === 'READY') break;
    await newPage.waitForTimeout(2000);
  }

  // ✅ שלב 6: פתח dropdown סוכן
  console.log("[Harel] Opening agent dropdown...");
  await reportFrame.evaluate(`(function() {
    const btn = document.querySelectorAll('div.ctrlbutton.cbo')[2];
    if (!btn) return 'NOT_FOUND';
    ['mousedown', 'mouseup', 'click'].forEach(evt =>
      btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
    );
    return 'CLICKED';
  })()`);

  // ✅ המתן שה-selectall יופיע
  console.log("[Harel] Waiting for selectall...");
  for (let i = 0; i < 20; i++) {
    const check = await reportFrame.evaluate(
      `document.querySelector('div.selectall') ? 'FOUND' : 'NOT_FOUND'`
    ).catch(() => 'ERROR');
    console.log(`[Harel] Selectall check ${i + 1}:`, check);
    if (check === 'FOUND') break;
    await newPage.waitForTimeout(1000);
  }

  // ✅ שלב 7: לחץ "בחר הכל"
  console.log("[Harel] Clicking בחר הכל...");
  const selectAllResult = await reportFrame.evaluate(`(function() {
    const el = document.querySelector('div.selectall');
    if (!el) return 'NOT_FOUND';
    ['mousedown', 'mouseup', 'click'].forEach(evt =>
      el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
    );
    return 'CLICKED';
  })()`);
  console.log("[Harel] Select all result:", selectAllResult);
  await newPage.waitForTimeout(1000);

  // ✅ שלב 8: לחץ כפתור סנן
  console.log("[Harel] Clicking filter apply button...");
  const filterResult = await reportFrame.evaluate(`(function() {
    let btn = document.querySelector('#H_InlineFilters_Apply_2');
    if (!btn) btn = document.querySelector('.filter-apply.click-enter');
    if (!btn) return 'NOT_FOUND';
    ['mousedown', 'mouseup', 'click'].forEach(evt =>
      btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
    );
    return 'CLICKED: ' + btn.textContent?.trim();
  })()`);
  console.log("[Harel] Filter result:", filterResult);

  await newPage.waitForTimeout(3000);
  await newPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

  // ✅ שלב 9: לחץ אקסל והורד
  console.log("[Harel] Clicking Excel export button...");
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
    const localPath = path.join(absDir, `${Date.now()}_${filename}`);
    await download.saveAs(localPath);
    console.log("[Harel] Saved:", localPath);
    results.push({ localPath, filename });

  } catch (e: any) {
    console.log("[Harel] Excel download failed:", e?.message);
  }

  return results;
}