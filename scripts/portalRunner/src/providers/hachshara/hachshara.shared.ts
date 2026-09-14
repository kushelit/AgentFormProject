import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";
import path from "path";

export async function hachsharaLogin(page: Page, username: string, password: string) {
  console.log("[Hachshara] Filling login form...");
  const cdp = await page.context().newCDPSession(page);


  // ✅ שלב 0: אם יש דף שגיאה - לחץ "חיבור מחדש"
  const errorCheck = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const link = document.querySelector('a.apmui-button-submit[href="/"]');
      if (!link) return 'NO_ERROR_PAGE';
      link.click();
      return 'CLICKED_RETRY';
    })()`,
    returnByValue: true,
  });
  console.log("[Hachshara] Error page check:", errorCheck.result.value);

  if (errorCheck.result.value === 'CLICKED_RETRY') {
    await page.waitForTimeout(3000);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  }


  // הארכנו מ-30 ל-60 ניסיונות (דקה שלמה) - לפעמים הטעינה איטית יותר
  // מהרגיל (רשת, redirect נוסף, שרת עמוס)
  let usernameFound = false;
  for (let i = 0; i < 60; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('#username') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    console.log(`[Hachshara] Login field check ${i + 1}:`, check.result.value);
    if (check.result.value === 'FOUND') { usernameFound = true; break; }
    await page.waitForTimeout(1000);
  }

  if (!usernameFound) {
    throw new Error("שדה שם המשתמש לא נטען בזמן - ייתכן שהפורטל השתנה");
  }

  // ✅ המתנה קצרה נוספת אחרי שהשדה "נמצא" - חלק מהאתרים מרנדרים את
  // השדה לפני שה-JS שלהם מסיים "לתפוס" אותו (hydration). אם ממלאים בדיוק
  // בחלון הזה, ה-framework יכול "למחוק" את מה שמילאנו כשהוא מסיים לטעון.
  await page.waitForTimeout(1500);

  // ✅ מילוי עם קריאה-חוזרת (readback) לוודא שהערך באמת נשאר בשדה,
  // ולא נמחק על ידי ה-framework של הדף. מנסה עד 5 פעמים.
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
      console.log(`[Hachshara] Fill attempt ${attempt + 1} threw an exception:`, JSON.stringify(fillResult.exceptionDetails));
    }

    if (fillResult.result.value !== 'FILLED') {
      console.log(`[Hachshara] Fill attempt ${attempt + 1} failed:`, fillResult.result.value);
      await page.waitForTimeout(1000);
      continue;
    }

    // קריאה-חוזרת: האם הערך באמת נשאר בשדות?
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
    console.log(`[Hachshara] Fill readback attempt ${attempt + 1}:`, { uLen: (parsed.u || '').length, pLen: (parsed.p || '').length });

    if (parsed.u === username && parsed.p === password) {
      fillOk = true;
      break;
    }

    console.log(`[Hachshara] Value did not stick (attempt ${attempt + 1}), retrying...`);
    await page.waitForTimeout(1000);
  }

  if (!fillOk) {
    throw new Error("לא הצלחנו למלא את פרטי ההתחברות - הערכים נמחקים על ידי הדף");
  }

  // ✅ עכשיו, כשאנחנו בטוחים שהערכים נשארו בשדות - לוחצים על כפתור הכניסה
  const submitResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const btn = document.querySelector('input.apmui-button-submit');
      if (!btn) return 'BUTTON_NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  console.log("[Hachshara] Submit result:", submitResult.result.value);

  if (submitResult.result.value !== 'CLICKED') {
    throw new Error("כפתור ההתחברות לא נמצא");
  }

  // ✅ וידוא אמיתי שההתחברות בכלל התקדמה - לא ממשיכים בשקט בלי לדעת.
  // מחפשים אחד מהשלושה: שדה OTP הופיע, שדה שם המשתמש נעלם (עברנו הלאה),
  // או ה-URL השתנה מדף הלוגין.
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
    console.log(`[Hachshara] Post-submit check ${i + 1}:`, check.result.value);
    if (check.result.value !== 'STILL_ON_LOGIN') { progressed = true; break; }
    await page.waitForTimeout(1000);
  }

  if (!progressed) {
    throw new Error("ההתחברות נכשלה - נשארנו על דף הלוגין אחרי הלחיצה על כניסה");
  }

  console.log("[Hachshara] Login step completed successfully.");
}

export async function hachsharaHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";
  const cdp = await page.context().newCDPSession(page);

  // console.log("[Hachshara] Waiting for OTP screen...");
  for (let i = 0; i < 30; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('input[name="text"]') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    // console.log(`[Hachshara] OTP check ${i + 1}:`, check.result.value);
    if (check.result.value === 'FOUND') break;
    await page.waitForTimeout(1000);
  }

  await setStatus(runId, {
    status: "otp_required",
    step: "ממתין לקוד אימות מהכשרה",
    "otp.mode": "firestore",
    monthLabel,
  });

  const otp = await pollOtp(runId);
  if (!otp) throw new Error("קוד ה-OTP לא התקבל");
  // console.log("[Hachshara] OTP received:", otp);

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

  // console.log("[Hachshara] OTP result:", result.result.value);

  await page.waitForTimeout(3000);
  for (let i = 0; i < 30; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `window.location.href.includes('agents.hcsra.co.il') ? 'LOGGED_IN' : 'WAITING'`,
      returnByValue: true,
    });
    // console.log(`[Hachshara] Login verify ${i + 1}:`, check.result.value);
    if (check.result.value === 'LOGGED_IN') break;
    await page.waitForTimeout(1000);
  }

  // console.log("[Hachshara] Waiting for home page to stabilize...");
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);

  await clearOtp(runId).catch(() => {});
}

async function hachsharaExportReport(
  page: Page,
  reportUrl: string,
  absDir: string,
  reportName: string
): Promise<{ localPath: string; filename: string }[]> {
  const results: { localPath: string; filename: string }[] = [];
  const cdp = await page.context().newCDPSession(page);

  // console.log(`[Hachshara] Navigating to ${reportName}...`);
  await page.goto(reportUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});

  // ✅ המתן שכפתור הפק דוח יופיע
  // console.log(`[Hachshara] Waiting for generate button...`);
  for (let i = 0; i < 30; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('#btn-submit') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    // console.log(`[Hachshara] Generate btn check ${i + 1}:`, check.result.value);
    if (check.result.value === 'FOUND') break;
    await page.waitForTimeout(2000);
  }

  // ✅ לחץ הפק דוח
  // console.log(`[Hachshara] Clicking הפק דוח for ${reportName}...`);
  const generateResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const btn = document.querySelector('#btn-submit');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  // console.log(`[Hachshara] Generate result:`, generateResult.result.value);

  // ✅ המתן לתוצאה - נתונים או לא נמצאו
  // console.log(`[Hachshara] Waiting for results...`);
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
    // console.log(`[Hachshara] Data check ${i + 1}:`, check.result.value);
    if (check.result.value === 'NO_DATA') {
      // console.log(`[Hachshara] No data found for ${reportName}`);
      return [];
    }
    if (check.result.value === 'HAS_DATA') {
      hasData = true;
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (!hasData) {
    // console.log(`[Hachshara] Timeout waiting for data - ${reportName}`);
    return [];
  }

  await page.waitForTimeout(2000);

  // ✅ לחץ הורד אקסל
  // console.log(`[Hachshara] Clicking הורד ל excel for ${reportName}...`);
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
    const localPath = path.join(absDir, `${Date.now()}_${filename}`);
    await download.saveAs(localPath);
    // console.log(`[Hachshara] Saved ${reportName}:`, localPath);
    results.push({ localPath, filename });

  } catch (e: any) {
    // console.log(`[Hachshara] Excel download failed for ${reportName}:`, e?.message);
  }

  return results;
}

export async function hachsharaNavigateAndExport(
  page: Page,
  absDir: string
): Promise<{ localPath: string; filename: string; templateId: string }[]> {
  const results: { localPath: string; filename: string; templateId: string }[] = [];

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
      // console.log(`[Hachshara] Starting report: ${rep.label}`);
      const files = await hachsharaExportReport(page, rep.url, absDir, rep.label);
      for (const f of files) {
        results.push({ ...f, templateId: rep.templateId });
      }
    } catch (e: any) {
      // console.error(`[Hachshara] Error in ${rep.label}:`, e.message);
    }
  }

  return results;
}