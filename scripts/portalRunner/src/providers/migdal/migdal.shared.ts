import type { Page, Download } from "playwright";
import type { RunnerCtx } from "../../types";




/**
 * בדיקה משותפת לשגיאת "הזיהוי נכשל, נסה שנית" - אלמנט זהה ומשמש גם לסיסמה
 * שגויה וגם ל-OTP שגוי (נבדק ואומת מול ריצה חיה בשני המצבים): אלמנט עם
 * id="credentials_table_postheader" ובתוכו הטקסט "הזיהוי נכשל".
 */
export async function migdalHasCredentialsError(page: Page): Promise<boolean> {
  try {
    const result = await page.evaluate(`
      (function() {
        const cell = document.getElementById('credentials_table_postheader');
        if (!cell) return false;
        const txt = (cell.innerText || cell.textContent || '').trim();
        return txt.includes('הזיהוי נכשל');
      })()
    `);
    return result === true;
  } catch (e: any) {
    if (String(e?.message || '').includes('Execution context was destroyed')) {
      return false;
    }
    throw e;
  }
}

/**
 * פונקציית עזר להמתנה שהלואדר של מגדל ייעלם (Kendo UI)
 */
export async function waitMigdalLoaderGone(page: Page, timeoutMs = 30000) {
  try {
    await page.waitForFunction(() => {
      const spinners = document.querySelectorAll('.k-loading-mask, .k-loading-image, #messageYesNoDialogSpinner, .modal-backdrop, .loading-backdrop');
      return Array.from(spinners).every(s => (s as any).offsetWidth === 0 || (s as any).style.display === 'none');
    }, { timeout: timeoutMs });
    // console.log("[Migdal] Loader gone ✅");
  } catch (e) {
    // console.log("[Migdal] Loader timeout or not found - proceeding");
  }
}

export async function migdalLogin(page: Page, username: string, password: string) {
  const injection = `
    (function(u, p) {
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const user = document.querySelector('#input_1');
          const pass = document.querySelector('#input_2');
          const btn = document.querySelector('input.credentials_input_submit');
          if (user && pass && btn) {
            clearInterval(interval);
            user.value = u;
            pass.value = p;
            user.dispatchEvent(new Event('input', { bubbles: true }));
            pass.dispatchEvent(new Event('input', { bubbles: true }));
            pass.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(() => btn.click(), 200);
            resolve("SUCCESS");
          }
          if (attempts > 60) {
            clearInterval(interval);
            resolve("FIELDS_NOT_FOUND");
          }
        }, 500);
      });
    })('${username}', '${password}')
  `;
  await page.evaluate(injection).catch(e => "ERROR: " + e.message);

  // בדיקה חוזרת (לא המתנה קבועה) - נותנת לדף זמן אמיתי להציג את שגיאת
  // הסיסמה אם יש, ושורדת ניווט (אותו עיקרון שכבר עבד בכלל).
  const start = Date.now();
  let hasError = false;
  while (Date.now() - start < 10000) {
    try {
      hasError = await migdalHasCredentialsError(page);
      if (hasError) break;
      const movedOn = await page.evaluate(`!document.querySelector('#input_1')`);
      if (movedOn) break;   // ← יציאה מוקדמת בהצלחה
    } catch (e) {
      // ניווט קרה תוך כדי הבדיקה - ממשיכים לנסות
    }
    await page.waitForTimeout(500).catch(() => {});
  }

  if (hasError) {
    throw new Error('מגדל: פרטי ההתחברות (ת.ז/סיסמה) שגויים - הפורטל הציג "הזיהוי נכשל, נסה שנית"');
  }
}

/**
 * OTP - עובד, לא נגעתי
 */
async function injectMigdalOtp(page: Page, otpCode: string) {
  const injectionScript = `
    (function(code) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const input = document.querySelector('#input_2'); 
        const btn = document.querySelector('.credentials_input_submit');
        if (input && btn) {
          clearInterval(interval);
          input.value = code;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          setTimeout(() => btn.click(), 200);
        }
        if (attempts > 40) clearInterval(interval);
      }, 500);
    })('${otpCode}')
  `;
  await page.evaluate(injectionScript).catch((e: any) => {
    if (!String(e?.message || '').includes('Execution context was destroyed')) {
      throw e;
    }
  });
}

async function waitForMigdalOtpDone(page: Page, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ready = await page.evaluate(`
        !!document.getElementById('goToHome') || !document.querySelector('#input_2')
      `);
      if (ready) return true;
    } catch (e) {
      // ניווט קרה תוך כדי הבדיקה - ממשיכים לנסות
    }
    await page.waitForTimeout(500).catch(() => {});
  }
  return false;
}

export async function migdalHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, pollOtp, setStatus, clearOtp } = ctx;

  let otpCode = await pollOtp(runId);
  if (!otpCode) throw new Error("OTP Timeout: הקוד לא הוקלד במערכת.");

  await setStatus(runId, { status: "running", step: "קוד התקבל, מזין למערכת מגדל..." });

  await injectMigdalOtp(page, otpCode);
  await clearOtp(runId).catch(() => {});

  // בדיקה חוזרת - האם המערכת דחתה את הקוד?
  await waitForMigdalOtpDone(page, 15000);
  const hasError = await migdalHasCredentialsError(page);

  if (hasError) {
    // הזדמנות נוספת אחת, כמו בפניקס ובכלל
    await setStatus(runId, {
      status: "otp_required",
      step: "הקוד הקודם היה שגוי - נסה שוב",
      "otp.mode": "firestore"
    });

    otpCode = await pollOtp(runId);
    if (!otpCode) throw new Error("OTP Timeout (ניסיון שני)");

    await setStatus(runId, { status: "running", step: "קוד התקבל, מזין למערכת מגדל..." });

   await injectMigdalOtp(page, otpCode);
    await clearOtp(runId).catch(() => {});

    await waitForMigdalOtpDone(page, 15000);
    const stillError = await migdalHasCredentialsError(page);

    if (stillError) {
      throw new Error('מגדל: קוד הזיהוי שגוי גם בניסיון השני - הפורטל הציג "הזיהוי נכשל, נסה שנית"');
    }
  }
}

/**
 * ניווט - עובד, לא נגעתי
 */
export async function navigateToCommissions(page: Page) {
  // console.log("[Migdal] Starting atomic navigation to Commissions...");

  const script = `
    (async function() {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      
      const getByText = (selector, text) => {
        return Array.from(document.querySelectorAll(selector))
          .find(el => (el.innerText || el.textContent || "").includes(text));
      };

      // מגדל הוסיפה כפתור נוסף עם הטקסט "כלים" (span.mat-button-wrapper) שמופיע לפני התפריט —
      // לכן קודם LABEL עם טקסט זהה, ורק אם אין — ההתנהגות הקודמת
      const findTools = () =>
        Array.from(document.querySelectorAll('label'))
          .find(el => (el.innerText || el.textContent || "").trim() === 'כלים' && el.offsetHeight > 0)
        || getByText('label, span, .item-label', 'כלים');

      // "דוחות" בחלונית כלים: id חדש goToSubCategory_Reports (היה goToSubCategory)
      const findReports = () =>
        document.getElementById('goToSubCategory_Reports')
        || document.getElementById('goToSubCategory')
        || Array.from(document.querySelectorAll('label'))
          .find(el => (el.innerText || el.textContent || "").trim() === 'דוחות' && el.offsetHeight > 0);

      // 1. לופ המתנה ל"כלים" - עד 10 שניות
      let tools = null;
      for (let i = 0; i < 10; i++) {
        tools = findTools();
        // בודקים שהאלמנט לא רק קיים אלא גם גלוי
        if (tools && tools.offsetHeight > 0) break; 
        await wait(1000);
      }

      if (!tools) return "TOOLS_NOT_FOUND_AFTER_RETRY";
      
      // 2. לחיצה וניסיון פתיחת תפריט משנה
      tools.click();
      await wait(1500);

      let reportBtn = findReports();
      if (!reportBtn) {
          // console.log("Submenu didn't open, clicking 'tools' again...");
          tools.click(); // לחיצה נוספת לביטחון
          await wait(2000);
          reportBtn = findReports();
      }

      if (!reportBtn) return "SUBMENU_FAILED_TO_OPEN";
      reportBtn.click();
      await wait(2000);

      // 3. לחיצה על "הסכמים ועמלות" עם המתנה קלה
      let target = null;
      for (let i = 0; i < 5; i++) {
        target = getByText('label.s-content, span', 'הסכמים ועמלות');
        if (target) break;
        await wait(1000);
      }
      
      if (!target) return "AGREEMENTS_LINK_NOT_FOUND";
      
      target.click();
      return "SUCCESS";
    })()
  `;

  const result = await page.evaluate(script).catch((e: any) => {
  if (String(e.message || "").includes("Execution context was destroyed")) {
    return "NAVIGATION_OCCURRED";
  }
  throw e;
});
  // console.log(`[Migdal] Navigation result: ${result}`);

  if (String(result) !== "SUCCESS" && String(result) !== "NAVIGATION_OCCURRED") {
  throw new Error(String(result));
}

  await waitMigdalLoaderGone(page);
}
/**
 * פתיחת דוח באמצעות קליק ישיר על השם שלו - ללא שגיאות TS וללא בעיות Serialization
 */
export async function migdalOpenReport(page: Page, reportName: string, opts: { exact?: boolean } = {}): Promise<boolean> {
  // console.log(`[Migdal] Step: Searching for report "${reportName}"...`);

  const injection = `
    (function(name, exact) {
      // מחפש בכל הסוגים שראינו בתמונות שלך (גם div וגם label)
      const selectors = 'label.title, div.rslt-item-param-ttl, .title, .item-label';
      const items = Array.from(document.querySelectorAll(selectors));
      // מנרמל רווחים ומקפים ("נטו- שנה" / "נטו - שנה" / "נטו–שנה" → "נטו-שנה")
      const norm = (t) => (t || "").replace(/\\s+/g, ' ').replace(/\\s*[-\u2013\u2014]\\s*/g, '-').trim();
      const cleanSearchName = norm(name);

      const target = items.find(el => {
        // תנאי "גלוי" רק בדוחות היקף (שם מלא אחרי חיפוש); בנפרעים — כמו שהיה
        if (exact && el.offsetHeight === 0) return false;
        const cleanText = norm(el.textContent);
        // exact: שני דוחות היקף מתחילים באותו טקסט — רק שם מלא
        return exact ? cleanText === cleanSearchName : cleanText.includes(cleanSearchName);
      });
      
      if (target) {
        target.scrollIntoView({ block: "center" });
        target.click();
        return "CLICKED";
      }
      
      // אם לא מצא, נחזיר לוג של מה שכן קיים על המסך כדי שנדע מה הטקסט המדויק
      return "NOT_FOUND. Available on page: " + items.map(i => i.textContent.trim()).join(' | ');
    })(${JSON.stringify(reportName)}, ${opts.exact ? 'true' : 'false'})
  `;

  // הרשימה יכולה להיטען לאט — מנסים עד 20 שניות לפני שמוותרים
  let result = "";
  for (let i = 0; i < 40; i++) {
    result = String(await page.evaluate(injection).catch((e: any) => "ERROR: " + e?.message));
    if (result === "CLICKED") break;
    await page.waitForTimeout(500);
  }
  // לא נמצא → לא מייצאים את מה שפתוח כרגע על המסך (היה יורד קובץ של דוח אחר)
  if (result !== "CLICKED") return false;
  // console.log(`[Migdal] Find & Click result for "${reportName}": ${result}`);

  await waitMigdalLoaderGone(page);

  // השארתי 15 שניות כדי לוודא שאת רואה שהדוח אכן נפתח
  // console.log("[Migdal] PAUSE: Observing for 15s...");
  await page.waitForTimeout(15000);
  return true;
}

/**
 * שדה "הקלד שם דוח לחיפוש" — נבדק ישירות בדף (כמו שאר הקובץ). ה-locator של Playwright
 * לא זיהה אותו כ"גלוי" למרות שהוא מוצג (migdalHekefTimings: NO_INPUT), ולכן הריצה חיכתה סתם.
 */
const FIND_SEARCH_INPUT = `
  Array.from(document.querySelectorAll('input.src-input, input[placeholder*="שם דוח"]'))[0] || null
`;

async function migdalWaitSearchInput(page: Page, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await page.evaluate(`!!(${FIND_SEARCH_INPUT})`).catch(() => false);
    if (ok) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

/** מקליד בשדה החיפוש (כולל אירוע input בשביל Angular) ולוחץ על כפתור החיפוש שלידו */
async function migdalTypeSearch(page: Page, text: string): Promise<boolean> {
  const res = await page.evaluate(`
    (function(text) {
      const input = ${FIND_SEARCH_INPUT};
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const btn = (input.closest('.src-input-container') || document).querySelector('button.src-btn');
      if (btn) btn.click();
      else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      return true;
    })(${JSON.stringify(text)})
  `).catch(() => false);
  return res === true;
}

/**
 * דף הדוחות הראשי, בלי קטגוריה פתוחה — רק בו שדה "הקלד שם דוח לחיפוש" גלוי
 * (כשקטגוריה כמו "הסכמים ועמלות" פתוחה, השדה קיים אבל מוסתר).
 */
export async function migdalGoToReportsLobby(page: Page): Promise<"menu" | "reload"> {
  // טעינה ישירה של דף הדוחות (3–4 שניות). מעבר דרך "כלים" → "דוחות" לא זוהה בזמן — ויתרנו עליו
  // לא מחכים ל-networkidle (האתר שולח בקשות ברקע כל הזמן) — ממשיכים ברגע ששדה החיפוש גלוי
  await page.goto("https://apmaccess.migdal.co.il/NewEra/reports-lobby", { waitUntil: "domcontentloaded" }).catch(() => {});
  await migdalWaitSearchInput(page, 20000);
  // שהדף יהיה מוכן לחיפוש — שקט ברשת, לכל היותר 5 שניות
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  // בלי waitMigdalLoaderGone: בדף הזה סימן טעינה יכול להישאר "גלוי" ולעכב 30 שניות סתם —
  // מחכים לאלמנט עצמו (שדה החיפוש) ואחר כך לשם הדוח בתוצאות
  await migdalClearModals(page);
  return "reload";
}

/**
 * גיבוי לחיפוש: דפדוף ברשימת הקטגוריה הפתוחה (חץ ימינה) עד שהשם המלא מופיע.
 * מחזיר true כשהדוח גלוי על המסך.
 */
export async function migdalPageToReport(page: Page, name: string, maxPages = 6): Promise<boolean> {
  const visible = () => page.evaluate(`
    (function(name) {
      const norm = (t) => (t || "").replace(/\\s+/g, ' ').replace(/\\s*[-–—]\\s*/g, '-').trim();
      return Array.from(document.querySelectorAll('label.title, div.rslt-item-param-ttl, .title'))
        .some(el => el.offsetHeight > 0 && norm(el.textContent) === norm(name));
    })(${JSON.stringify(name)})
  `).catch(() => false);

  for (let i = 0; i <= maxPages; i++) {
    if (await visible()) return true;
    const moved = await page.evaluate(`
      (function() {
        const arrow = Array.from(document.querySelectorAll('.pager-wrapper .arrow.right'))
          .find(el => el.offsetHeight > 0 && !el.classList.contains('disabled'));
        if (!arrow) return false;
        (arrow.querySelector('label') || arrow).click();
        return true;
      })()
    `).catch(() => false);
    if (!moved) return false;
    await page.waitForTimeout(1500);
    await waitMigdalLoaderGone(page, 5000);
  }
  return false;
}

/** כותרות הדוחות שגלויות כרגע על המסך— לאבחון כשדוח לא נמצא (שמות דוחות בלבד) */
export async function migdalVisibleReportTitles(page: Page): Promise<string[]> {
  return (await page.evaluate(`
    (function() {
      const items = Array.from(document.querySelectorAll('label.title, div.rslt-item-param-ttl, .title'));
      return items.filter(el => el.offsetHeight > 0)
        .map(el => (el.textContent || '').replace(/\\s+/g, ' ').trim())
        .filter(Boolean).slice(0, 40);
    })()
  `).catch(() => [])) as string[];
}

/**
 * חיפוש דוח בשדה "הקלד שם דוח לחיפוש" בדף הסכמים ועמלות.
 * דוחות שלא בעמוד הראשון של הרשימה לא קיימים ב-DOM עד שמדפדפים — החיפוש מביא אותם.
 * FOUND = הדוח בשם המלא (expectName) מופיע בתוצאות.
 */
export async function migdalSearchReports(
  page: Page, text: string, expectName: string
): Promise<"FOUND" | "NO_INPUT" | "NOT_FOUND"> {
  if (!(await migdalWaitSearchInput(page, 5000))) return "NO_INPUT";
  // שני ניסיונות: אם החיפוש הראשון לא הביא את הדוח — מקלידים ומחפשים שוב
  for (let attempt = 0; attempt < 2; attempt++) {
  if (!(await migdalTypeSearch(page, text))) return "NO_INPUT";

  // מחכים שהשם המלא יופיע בתוצאות (לא סומכים על "נמצאו N תוצאות" — המספר יכול להיות באלמנט נפרד)
  for (let i = 0; i < 20; i++) {
    const found = await page.evaluate(`
      (function(name) {
        const norm = (t) => (t || "").replace(/\\s+/g, ' ').replace(/\\s*[-–—]\\s*/g, '-').trim();
        return Array.from(document.querySelectorAll('label.title, div.rslt-item-param-ttl, .title'))
          .some(el => el.offsetHeight > 0 && norm(el.textContent) === norm(name));
      })(${JSON.stringify(expectName)})
    `).catch(() => false);
    if (found) return "FOUND";
    await page.waitForTimeout(500);
  }
  }
  return "NOT_FOUND";
}


export async function migdalReturnToAgreements(page: Page) {
  // console.log("[Migdal] Returning to Agreements menu via side-bar...");

  // שלב 1: לחיצה על דוחות
  await page.evaluate(`
    (function() {
      const el = Array.from(document.querySelectorAll('span.item-label'))
        .find(e => (e.textContent || "").includes('דוחות') && e.offsetWidth > 0);
      if (el) el.click();
    })()
  `).catch(() => {});

  await page.waitForTimeout(2000);

  // שלב 2: לחיצה על הסכמים ועמלות
  await page.evaluate(`
    (function() {
      const el = Array.from(document.querySelectorAll('label.s-content'))
        .find(e => (e.textContent || "").includes('הסכמים ועמלות') && e.offsetWidth > 0);
      if (el) el.click();
    })()
  `).catch(() => {});

  // שלב 3: המתן שהדף יתייצב
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await waitMigdalLoaderGone(page);

  // שלב 4: בדוק אם הצלחנו
  const isSelected = await page.evaluate(`
    (function() {
      const label = Array.from(document.querySelectorAll('label.s-content'))
        .find(e => (e.textContent || "").includes('הסכמים ועמלות'));
      const parent = label?.closest('div.category');
      return !!(parent && parent.classList.contains('selected'));
    })()
  `).catch(() => false);

  if (!isSelected) {
    // console.warn("[Migdal] Falling back to direct navigation...");
    await page.goto(
      "https://apmaccess.migdal.co.il/NewEra/reports-lobby",
      { waitUntil: "networkidle" }
    ).catch(() => {});
    await page.waitForTimeout(3000);
    await page.evaluate(`
      (function() {
        const label = Array.from(document.querySelectorAll('label.s-content'))
          .find(e => (e.textContent || "").includes('הסכמים ועמלות'));
        if (label) label.click();
      })()
    `).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await waitMigdalLoaderGone(page);
  }

  // console.log("[Migdal] Back to Agreements ✅");
}

/**
 * יצוא אקסל - עובד, לא נגעתי
 */
export async function migdalExportExcel(page: Page): Promise<Download | null> {
  // console.log("[Migdal] Triggering Excel Export...");
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    const clicked = await page.evaluate(`
      (function() {
        const btn = Array.from(document.querySelectorAll('a, button, span.item-label'))
          .find(el => {
            const txt = (el.innerText || "").toLowerCase();
            return (el.getAttribute('ng-click') && el.getAttribute('ng-click').includes('exportToExcel')) || 
                   (txt.includes('אקסל') && !txt.includes('pdf'));
          });
        if (btn) { btn.click(); return true; }
        return false;
      })()
    `);
    if (!clicked) return null;
    return await downloadPromise;
  } catch (e) {
    return null;
  }
}

/**
 * פונקציה לסגירת הודעות קופצות (Modals) במגדל
 */
export async function migdalClearModals(page: Page) {
  // console.log("[Migdal] Checking for annoying pop-ups...");
  
  const script = `
    (async function() {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      
      // 1. חיפוש כפתור ה-X (סגירה) בפינה
      // במגדל זה בדרך כלל בתוך MuiDialog או אלמנט עם 'close'
      const closeBtn = document.querySelector('button[aria-label="close"], .MuiDialog-container button:first-child, svg[data-testid="CloseIcon"]');
      if (closeBtn) {
        // console.log("Migdal: Found 'X' button, closing modal...");
        closeBtn.closest('button')?.click() || closeBtn.click();
        await wait(1000);
        return "CLOSED_X";
      }

      // 2. חיפוש כפתור ה"אישור" או "לפרטים נוספים" (כמו בתמונה ששלחת)
      const actionButtons = Array.from(document.querySelectorAll('button, .MuiButton-root'));
      const targetBtn = actionButtons.find(btn => {
        const txt = (btn.textContent || "").trim();
        return txt.includes('לפרטים נוספים') || txt.includes('הבנתי') || txt.includes('סגור');
      });

      if (targetBtn) {
        // console.log("Migdal: Found action button, clicking to clear...");
        targetBtn.click();
        await wait(1000);
        return "CLOSED_VIA_BUTTON";
      }

      return "NO_MODAL_FOUND";
    })()
  `;

  try {
    const result = await page.evaluate(script);
    // console.log(`[Migdal] Modal clearer result: ${result}`);
  } catch (e) {
    // מתעלמים משגיאות כאן - אם אין מודאל, הכל טוב
  }
}