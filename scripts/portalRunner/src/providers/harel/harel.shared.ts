import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";
import path from "path";

export async function harelLogin(page: Page, username: string, password: string) {
  // console.log("[Harel] Checking for error page...");
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
  // console.log("[Harel] Error page check:", errorCheck.result.value);

  if (errorCheck.result.value === 'CLICKED_RETRY') {
    await page.waitForTimeout(3000);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }

  // ✅ שלב 1: המתנה לשדות הלוגין
  // console.log("[Harel] Waiting for login fields...");
  for (let i = 0; i < 20; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('#input_1') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    // console.log(`[Harel] Login field check ${i + 1}:`, check.result.value);
    if (check.result.value === 'FOUND') break;
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
    })('${username}', '${password}')`,
    returnByValue: true,
  });
}

export async function harelHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";
  const cdp = await page.context().newCDPSession(page);

  // console.log("[Harel] Waiting for OTP screen...");
  for (let i = 0; i < 30; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('input[name="otpass"]') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    // console.log(`[Harel] OTP check ${i + 1}:`, check.result.value);
    if (check.result.value === 'FOUND') break;
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

  const otp = await pollOtp(runId);
  if (!otp) throw new Error("קוד ה-OTP לא התקבל");
  // console.log("[Harel] OTP received:", otp);

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
    })('${otp}')`,
    returnByValue: true,
  });

  // console.log("[Harel] OTP result:", result.result.value);

  await page.waitForTimeout(3000);
  for (let i = 0; i < 20; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `window.location.href.includes('default.aspx') ? 'LOGGED_IN' : 'WAITING'`,
      returnByValue: true,
    });
    // console.log(`[Harel] Login verify ${i + 1}:`, check.result.value);
    if (check.result.value === 'LOGGED_IN') break;
    await page.waitForTimeout(1000);
  }

  // 🔧 buffer נוסף אחרי אישור LOGGED_IN — נותן לסשן/לקוקיז של הראל "להתבסס"
  // בצד השרת לפני שממשיכים לנווט לדוח. זה מדמה את ההמתנה הטבעית שקיימת
  // כשמעבירים URL לטאב חדש ידנית (כמו שמיכל גילתה שעוזר).
  console.log("[Harel] ממתין 5 שניות לאחר אישור LOGGED_IN, לפני המשך...");
  await page.waitForTimeout(5000);

  await clearOtp(runId).catch(() => {});
}

export async function harelNavigateToReport(
  page: Page,
  absDir: string
): Promise<{ localPath: string; filename: string }[]> {
  const results: { localPath: string; filename: string }[] = [];
  const reportUrl = "https://agents-int.harel-group.co.il/Information/Reports/life-health-saving/Agent/Pages/commissions/payments-assembly.aspx";

  // console.log("[Harel] Navigating to report page...");
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});

  // ✅ שלב 1: המתן שה-frame עם הטבלה יטען (עם רענון אוטומטי אם תקוע)
  // console.log("[Harel] Waiting for frame with table...");
  let frame = null;
  for (let i = 0; i < 60; i++) {
    frame = page.frames().find(f => f.url().includes('_layouts/15/H'));
    if (frame) {
      const check = await frame.evaluate(
        `document.querySelector('th[data_colid="Schum_Nifraim"]') ? 'FOUND' : 'NOT_FOUND'`
      ).catch(() => 'ERROR');
      // console.log(`[Harel] Table check ${i + 1}:`, check);
      if (check === 'FOUND') break;
    } else {
      // console.log(`[Harel] Table check ${i + 1}: frame not found yet`);
    }
    // 🔧 אחרי ~15 שניות בלי הצלחה — מרענן את הדף (מדמה הדבקת URL טרי לטאב חדש,
    // שגילינו שעוזר כשהדף נתקע ב-spinner של ה-iframe הפנימי)
    if (i === 7) {
      console.log('[Harel] שלב 1: עדיין לא נמצא אחרי ~15ש׳ — מרענן דף...');
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    }
    await page.waitForTimeout(2000);
  }

  if (!frame) throw new Error("Frame לא נמצא");

  // ✅ שלב 2: לחץ על "נפרעים" בשורה הראשונה
  // console.log("[Harel] Clicking first row נפרעים...");
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
  // console.log("[Harel] Click result:", clickResult);

  // ✅ שלב 3: המתן ל-modal נפרעים
  // console.log("[Harel] Waiting for נפרעים modal...");
  for (let i = 0; i < 20; i++) {
    const check = await frame.evaluate(
      `document.querySelector('td[data_colid="_M2_Schum"].cell_action') ? 'FOUND' : 'NOT_FOUND'`
    ).catch(() => 'ERROR');
    // console.log(`[Harel] Modal check ${i + 1}:`, check);
    if (check === 'FOUND') break;
    await page.waitForTimeout(1000);
  }

  // ✅ שלב 4: לחץ על תא החודש - וחכה לטאב חדש
  // console.log("[Harel] Clicking month cell - waiting for new tab...");
  const [newPage] = await Promise.all([
    page.context().waitForEvent("page", { timeout: 120000 }),
    frame.evaluate(`(function() {
      const cell = document.querySelector('td[data_colid="_M2_Schum"].cell_action');
      if (!cell) return 'NOT_FOUND';
      cell.click();
      return 'CLICKED: ' + cell.getAttribute('data-title') + ' = ' + cell.textContent?.trim();
    })()`)
  ]);

  // console.log("[Harel] New tab opened:", newPage.url());
  await newPage.bringToFront();
  await newPage.waitForLoadState("domcontentloaded", { timeout: 120000 }).catch(() => {});

  // ✅ שלב 5: המתן שה-frame OAOAnalysis יטען בטאב החדש
  // console.log("[Harel] Waiting for report frame in new tab...");
  let reportFrame = null;
  for (let i = 0; i < 60; i++) {
    reportFrame = newPage.frames().find(f => f.url().includes('OAOAnalysis'));
    if (reportFrame) {
      // console.log(`[Harel] Report frame found: ${reportFrame.url().substring(0, 80)}`);
      break;
    }
    // console.log(`[Harel] Report frame check ${i + 1}: not found yet`);
    await newPage.waitForTimeout(2000);
  }

  if (!reportFrame) throw new Error("Report frame לא נמצא");

  // ✅ המתן שה-frame יהיה מוכן
  // console.log("[Harel] Waiting for frame controls to be ready...");
  for (let i = 0; i < 60; i++) {
    const check = await reportFrame.evaluate(
      `document.querySelectorAll('div.ctrlbutton.cbo').length >= 3 ? 'READY' : 'NOT_READY'`
    ).catch(() => 'ERROR');
    // console.log(`[Harel] Frame ready check ${i + 1}:`, check);
    if (check === 'READY') break;
    await newPage.waitForTimeout(2000);
  }

  // ✅ שלב 6: פתח dropdown סוכן
  // console.log("[Harel] Opening agent dropdown...");
  await reportFrame.evaluate(`(function() {
    const btn = document.querySelectorAll('div.ctrlbutton.cbo')[2];
    if (!btn) return 'NOT_FOUND';
    ['mousedown', 'mouseup', 'click'].forEach(evt =>
      btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
    );
    return 'CLICKED';
  })()`);

  // ✅ המתן שה-selectall יופיע
  // console.log("[Harel] Waiting for selectall...");
  for (let i = 0; i < 20; i++) {
    const check = await reportFrame.evaluate(
      `document.querySelector('div.selectall') ? 'FOUND' : 'NOT_FOUND'`
    ).catch(() => 'ERROR');
    // console.log(`[Harel] Selectall check ${i + 1}:`, check);
    if (check === 'FOUND') break;
    await newPage.waitForTimeout(1000);
  }

  // ✅ שלב 7: לחץ "בחר הכל"
  // console.log("[Harel] Clicking בחר הכל...");
  const selectAllResult = await reportFrame.evaluate(`(function() {
    const el = document.querySelector('div.selectall');
    if (!el) return 'NOT_FOUND';
    ['mousedown', 'mouseup', 'click'].forEach(evt =>
      el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
    );
    return 'CLICKED';
  })()`);
  // console.log("[Harel] Select all result:", selectAllResult);
  await newPage.waitForTimeout(1000);

  // ✅ שלב 8: לחץ כפתור סנן
  // console.log("[Harel] Clicking filter apply button...");
  const filterResult = await reportFrame.evaluate(`(function() {
    let btn = document.querySelector('#H_InlineFilters_Apply_2');
    if (!btn) btn = document.querySelector('.filter-apply.click-enter');
    if (!btn) return 'NOT_FOUND';
    ['mousedown', 'mouseup', 'click'].forEach(evt =>
      btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }))
    );
    return 'CLICKED: ' + btn.textContent?.trim();
  })()`);
  // console.log("[Harel] Filter result:", filterResult);

  await newPage.waitForTimeout(3000);
  await newPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

  // ✅ שלב 9: לחץ אקסל והורד
  // console.log("[Harel] Clicking Excel export button...");
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
    // console.log("[Harel] Saved:", localPath);
    results.push({ localPath, filename });

  } catch (e: any) {
    // console.log("[Harel] Excel download failed:", e?.message);
  }

  return results;
}

// ============================================================================
// 🔧 פונקציות עזר — קליק עכבר אמיתי בתוך frame, עם retry/polling/אימות
//
// הסיבה: ה-widgets ב-OAOAnalysis (קומבואים, ולעיתים גם המודלים בטבלה הראשית)
// בנויים כ-single-spa micro-frontends. dispatchEvent/click שנשלח לפני שה-app
// הרלוונטי "עלה" (mounted) לא מגיע לשום event listener אמיתי — שום דבר לא
// קורה, וזה קורה בעיקר כשמדובר באלמנט הראשון שתלוי ב-app שעדיין לא היה לו
// סיבה לעלות קודם. קליק עכבר אמיתי (page.mouse.click) + retry + אימות
// שהתופעה הצפויה אכן קרתה, פותרים את זה בלי תלות במזל תזמון.
// ============================================================================

async function getCenterInFrame(
  filterFrame: any,
  jsElementExpr: string
): Promise<{ x: number; y: number } | null> {
  return await filterFrame.evaluate(`(function() {
    const el = ${jsElementExpr};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`).catch(() => null);
}

async function getFrameOffset(newPage: any): Promise<{ x: number; y: number }> {
  const rect = await newPage.evaluate(`(function() {
    const frames = Array.from(document.querySelectorAll('iframe'));
    const f = frames.find((f) => f.src && f.src.includes('OAOAnalysis'));
    if (!f) return null;
    const r = f.getBoundingClientRect();
    return { x: r.left, y: r.top };
  })()`).catch(() => null);
  return { x: rect?.x || 0, y: rect?.y || 0 };
}

// קליק עכבר אמיתי (לא dispatchEvent) על אלמנט בתוך ה-iframe (OAOAnalysis)
async function clickElementInFrame(
  newPage: any,
  filterFrame: any,
  jsElementExpr: string,
  label = ''
): Promise<boolean> {
  const center = await getCenterInFrame(filterFrame, jsElementExpr);
  if (!center) {
    console.log(`[Harel][Tzvira] clickElementInFrame: NOT_FOUND ${label}`);
    return false;
  }

  const offset = await getFrameOffset(newPage);
  const absX = offset.x + center.x;
  const absY = offset.y + center.y;

  await newPage.mouse.move(absX, absY);
  await newPage.mouse.click(absX, absY);
  console.log(`[Harel][Tzvira] clicked ${label} at (${Math.round(absX)}, ${Math.round(absY)})`);
  return true;
}

// פותח קומבו (חברה מנהלת / סוכן) ובוחר "בחר הכל" — עם retry אם ה-single-spa
// app של הקומבו עדיין לא עלה
async function openComboAndSelectAll(
  newPage: any,
  filterFrame: any,
  comboElementExpr: string,
  label: string
): Promise<boolean> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const opened = await clickElementInFrame(
      newPage,
      filterFrame,
      comboElementExpr,
      `open ${label} (ניסיון ${attempt})`
    );
    if (!opened) {
      console.log(`[Harel][Tzvira] ${label}: תיבת הקומבו לא נמצאה בכלל — עוצר`);
      return false;
    }

    // polling אמיתי - לא timeout קבוע
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
      // לוחצים על ה-selectall האחרון שנפתח (לא הראשון בדף, כדי לא לפגוע
      // בקומבו קודם שאולי נשאר פתוח)
      const ok = await clickElementInFrame(
        newPage,
        filterFrame,
        `(function(){ const items = document.querySelectorAll('div.selectall'); return items[items.length - 1]; })()`,
        `select-all ${label}`
      );
      if (ok) {
        console.log(`[Harel][Tzvira] ${label}: בחר-הכל בוצע בניסיון ${attempt}`);
        return true;
      }
    }

    console.log(`[Harel][Tzvira] ${label}: selectall לא הופיע בניסיון ${attempt}, מנסה שוב...`);
  }

  console.log(`[Harel][Tzvira] ${label}: נכשל אחרי כל הניסיונות`);
  return false;
}

// קליק על אלמנט + אימות שתופעה צפויה קרתה (למשל: מודל נפתח) — עם retry על
// כל השרשרת (קליק + אימות) ולא רק על הקליק. אם נכשל לחלוטין, מחזיר false
// והקריאה צריכה לעשות throw מפורש (לא להמשיך בשקט).
async function clickAndVerify(
  page: Page,
  frame: any,
  clickExpr: string,
  verifyExpr: string,
  label: string,
  maxAttempts = 3,
  verifyTimeoutMs = 8000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const clickResult = await frame.evaluate(clickExpr).catch(() => 'ERROR');
    console.log(`[Harel][Tzvira] ${label}: לחיצה ניסיון ${attempt} -> ${clickResult}`);

    if (clickResult === 'NOT_FOUND' || clickResult === 'ERROR') {
      console.log(`[Harel][Tzvira] ${label}: האלמנט ללחיצה לא נמצא, ממתין ומנסה שוב...`);
      await page.waitForTimeout(1000);
      continue;
    }

    const start = Date.now();
    while (Date.now() - start < verifyTimeoutMs) {
      const check = await frame.evaluate(verifyExpr).catch(() => 'ERROR');
      if (check === 'FOUND') {
        console.log(`[Harel][Tzvira] ${label}: אומת בהצלחה בניסיון ${attempt}`);
        return true;
      }
      await page.waitForTimeout(500);
    }
    console.log(`[Harel][Tzvira] ${label}: הלחיצה קרתה אך האימות נכשל בניסיון ${attempt}, מנסה קליק נוסף...`);
  }

  console.log(`[Harel][Tzvira] ${label}: נכשל לחלוטין אחרי ${maxAttempts} ניסיונות`);
  return false;
}

export async function harelNavigateToTzviraReport(
  page: Page,
  absDir: string,
  _ctx?: RunnerCtx
): Promise<{ localPath: string; filename: string }[]> {
  const results: { localPath: string; filename: string }[] = [];
  const reportUrl = "https://agents-int.harel-group.co.il/Information/Reports/life-health-saving/Agent/Pages/commissions/payments-assembly.aspx";

  console.log("[Harel][Tzvira] === מתחיל ריצת דוח צבירה ===");

  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});

  // ✅ שלב 1: המתן שה-frame עם הטבלה הראשית יטען (עם רענון אוטומטי אם תקוע)
  console.log("[Harel][Tzvira] שלב 1: מחפש frame עם טבלת מוצרי צבירה...");
  let frame = null;
  for (let i = 0; i < 60; i++) {
    frame = page.frames().find(f => f.url().includes('_layouts/15/H'));
    if (frame) {
      const check = await frame.evaluate(
        `document.querySelector('th[data_colid="Schum_Mutzarim_Finnasim"]') ? 'FOUND' : 'NOT_FOUND'`
      ).catch(() => 'ERROR');
      if (check === 'FOUND') {
        console.log(`[Harel][Tzvira] שלב 1: נמצא (ניסיון ${i + 1})`);
        break;
      }
    }
    // 🔧 אחרי ~15 שניות בלי הצלחה — מרענן את הדף (מדמה הדבקת URL טרי לטאב
    // חדש, שגילינו שעוזר כשהדף נתקע ב-spinner של ה-iframe הפנימי)
    if (i === 7) {
      console.log('[Harel][Tzvira] שלב 1: עדיין לא נמצא אחרי ~15ש׳ — מרענן דף...');
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    }
    await page.waitForTimeout(2000);
  }

  if (!frame) throw new Error("[Harel][Tzvira] שלב 1: ה-frame הראשי לא נמצא");

  // ✅ שלב 2-3: קליק על שורת "מוצרי צבירה" + אימות שמודל ראשון נפתח (עם retry)
  console.log("[Harel][Tzvira] שלב 2-3: לוחץ על שורת מוצרי צבירה ומאמת פתיחת מודל ראשון...");
  const step2_3Ok = await clickAndVerify(
    page,
    frame,
    `(function() {
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
    })()`,
    `document.querySelector('td[data_colid="_M2_Schum_2"].cell_action') ? 'FOUND' : 'NOT_FOUND'`,
    'שלב 2-3'
  );
  if (!step2_3Ok) throw new Error("[Harel][Tzvira] שלב 2-3: לא הצלחנו לפתוח את המודל הראשון אחרי כל הניסיונות");

  // ✅ שלב 4-5: קליק על תא מודל ראשון + אימות שמודל שני נפתח (עם retry)
  console.log("[Harel][Tzvira] שלב 4-5: לוחץ על תא מודל ראשון ומאמת פתיחת מודל שני...");
  const step4_5Ok = await clickAndVerify(
    page,
    frame,
    `(function() {
      const cell = document.querySelector('td[data_colid="_M2_Schum_2"].cell_action');
      if (!cell) return 'NOT_FOUND';
      cell.click();
      return 'CLICKED';
    })()`,
    `document.querySelectorAll('td[data_colid="_M2_Schum_2"].cell_action').length >= 2 ? 'FOUND' : 'NOT_FOUND'`,
    'שלב 4-5'
  );
  if (!step4_5Ok) throw new Error("[Harel][Tzvira] שלב 4-5: לא הצלחנו לפתוח את המודל השני אחרי כל הניסיונות");

  // ✅ שלב 6: קליק על תא מודל שני - וחכה לטאב חדש
  // (בנקודה הזו אנחנו בטוחים ש-2 התאים קיימים, כי שלב 4-5 אומת את זה)
  console.log("[Harel][Tzvira] שלב 6: לוחץ על תא מודל שני, מחכה לטאב חדש...");
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

  console.log(`[Harel][Tzvira] שלב 6: טאב חדש נפתח: ${newPage.url()}`);
  await newPage.bringToFront();
  await newPage.waitForLoadState("domcontentloaded", { timeout: 120000 }).catch(() => {});
  await newPage.waitForTimeout(3000);

  // 🔧 לוג שגיאות JS בעמוד החדש — עוזר לאשר/לשלול תיאוריות תזמון בעתיד
  newPage.on('pageerror', (e: any) => console.log(`[Harel][Tzvira] PAGEERROR: ${e?.message}`));

  // ✅ שלב 7: המתן שה-frame OAOAnalysis יטען בטאב החדש
  console.log("[Harel][Tzvira] שלב 7: מחפש frame OAOAnalysis בטאב החדש...");
  let filterFrame = null;
  for (let i = 0; i < 60; i++) {
    filterFrame = newPage.frames().find(f => f.url().includes('OAOAnalysis'));
    if (filterFrame) {
      const check = await filterFrame.evaluate(
        `document.querySelector('#_ctrlParam__4') ? 'FOUND' : 'NOT_FOUND'`
      ).catch(() => 'ERROR');
      if (check === 'FOUND') {
        console.log(`[Harel][Tzvira] שלב 7: נמצא (ניסיון ${i + 1})`);
        break;
      }
    }
    await newPage.waitForTimeout(2000);
  }

  if (!filterFrame) throw new Error("[Harel][Tzvira] שלב 7: filter frame לא נמצא");

  // 🔧 buffer קצר נוסף לפני שמתחילים לאנטרקט עם הקומבואים — נותן ל-single-spa
  // הזדמנות סבירה לעלות לפני הניסיון הראשון
  await newPage.waitForTimeout(1500);

  // ✅ שלב 7.5: אפס מסנן לפני הגדרת ערכים — קליק אמיתי
  console.log("[Harel][Tzvira] שלב 7.5: מאפס מסנן...");
  const clearOk = await clickElementInFrame(
    newPage,
    filterFrame,
    `document.querySelector('#H_InlineFilters_Clear_2')`,
    'שלב 7.5 (אפס מסנן)'
  );
  console.log(`[Harel][Tzvira] שלב 7.5: תוצאה = ${clearOk}`);
  await newPage.waitForTimeout(2000);

  // ✅ שלב 8: חברה מנהלת — פתח + בחר הכל (עם retry)
  console.log("[Harel][Tzvira] שלב 8: פותח קומבו חברה מנהלת...");
  const step8Ok = await openComboAndSelectAll(
    newPage,
    filterFrame,
    `document.querySelector('#_ctrlParam__4 .ctrlbutton.cbo')`,
    'שלב 8 (חברה מנהלת)'
  );
  if (!step8Ok) {
    console.log('[Harel][Tzvira] שלב 8: נכשל — ממשיך בכל זאת (יתכן שהפילטר יחזיר תוצאה חלקית/שגויה)');
  }
  await newPage.waitForTimeout(500);

  // ✅ שלב 9: סוכן — פתח + בחר הכל (עם retry)
  console.log("[Harel][Tzvira] שלב 9: פותח קומבו סוכן...");
  const step9Ok = await openComboAndSelectAll(
    newPage,
    filterFrame,
    `document.querySelector('#_ctrlParam__3 .ctrlbutton.cbo')`,
    'שלב 9 (סוכן)'
  );
  if (!step9Ok) {
    console.log('[Harel][Tzvira] שלב 9: נכשל — ממשיך בכל זאת');
  }
  await newPage.waitForTimeout(1000);

  // ⛔ שלב 10 (בחירת חודש ב-datepicker) הוסר — התאריך כבר מגיע מקודד ב-URL
  // של הטאב החדש (FilterParams=...TAARIX_ZIKUY_SAP_F|...~TAARIX_ZIKUY_SAP_T|...)
  // שנקבע בשלב 6, כך שה-datepicker היה redundant ולא משפיע בפועל.

  // ✅ שלב 11: לחץ סנן מידע — קליק אמיתי
  console.log("[Harel][Tzvira] שלב 11: לוחץ סנן מידע...");
  const filterOk = await clickElementInFrame(
    newPage,
    filterFrame,
    `(function(){ return document.querySelector('#H_InlineFilters_Apply_2') || document.querySelector('.filter-apply.click-enter'); })()`,
    'שלב 11 (סנן מידע)'
  );
  console.log(`[Harel][Tzvira] שלב 11: תוצאה = ${filterOk}`);

  await newPage.waitForTimeout(10000);
  await newPage.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
  await newPage.waitForTimeout(5000); // buffer נוסף אחרי networkidle

  // ✅ שלב 12: הורד אקסל — קליק אמיתי
  console.log("[Harel][Tzvira] שלב 12: לוחץ הורד אקסל...");
  try {
    const [download] = await Promise.all([
      newPage.waitForEvent("download", { timeout: 60000 }),
      clickElementInFrame(
        newPage,
        filterFrame,
        `document.querySelector('.bar-excel')`,
        'שלב 12 (הורד אקסל)'
      ),
    ]);

    const filename = download.suggestedFilename();
    const localPath = path.join(absDir, `${Date.now()}_${filename}`);
    await download.saveAs(localPath);
    console.log(`[Harel][Tzvira] שלב 12: נשמר בהצלחה -> ${localPath}`);
    results.push({ localPath, filename });

  } catch (e: any) {
    console.log(`[Harel][Tzvira] שלב 12: הורדת אקסל נכשלה: ${e?.message}`);
  }

  console.log(`[Harel][Tzvira] === סיום ריצה, ${results.length} קבצים הורדו ===`);
  return results;
}