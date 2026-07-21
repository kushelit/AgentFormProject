import type { Page, Download, BrowserContext } from "playwright";
import type { RunnerCtx } from "../../types";

/**
 * המתנה שהלואדר ייעלם
 */
export async function waitPhoenixLoaderGone(page: Page, timeoutMs = 30000) {
  try {
    const loaderScript = `() => {
      const selectors = ['.loading', '.spinner', '.overlay', '[class*="loader"]', '.k-loading-mask'];
      const nodes = selectors.flatMap(sel => Array.from(document.querySelectorAll(sel)));
      if (!nodes.length) return true;
      return nodes.every(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden' || el.offsetWidth === 0;
      });
    }`;
    await page.waitForFunction(loaderScript, { timeout: timeoutMs });
  } catch (e) {
    // console.log("[Phoenix] Loader timeout - continuing");
  }
}

/**
 * המתנה ממוקדת וקצרה: לא בודקים "לואדר כללי נעלם", אלא ממתינים ישירות
 * לאלמנט הפעולה שאנחנו צריכים (למשל כפתור/אייקון אקסל) שיהיה גלוי.
 * זה אמור לחסוך את ההמתנות הכפולות/משולשות שגורמות לעיכוב של דקות.
 */
async function waitForSelectorFast(
  page: Page,
  selector: string,
  timeoutMs = 15000,
  state: "visible" | "attached" = "visible"
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout: timeoutMs, state });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * פונקציה חדשה: סגירת הפופ-אפ שחוסם את המסך (זה בסדר / חסימה)
 */
async function closeInitialModals(page: Page) {
  // console.log("[Phoenix] Checking for blocking modals...");
  try {
    // לחיצה על "זה בסדר" (או כפתור אישור דומה בפופ-אפ)
    const approveBtn = page.locator('button:has-text("זה בסדר"), button:has-text("אישור")').first();
    if (await approveBtn.isVisible({ timeout: 5000 })) {
      // console.log("[Phoenix] Closing modal: Clicking 'זה בסדר'");
      await approveBtn.click({ force: true });
      await page.waitForTimeout(2000);
    }

    // סגירת פופ-אפ נוסף עם X אם קיים (לפי image_b608ee יש X קטן למעלה)
    const xBtn = page.locator('button .icon-close, .modal-close, [aria-label="Close"]').first();
    if (await xBtn.isVisible({ timeout: 2000 })) {
        await xBtn.click({ force: true });
    }
  } catch (e) {
    // console.log("[Phoenix] No modals found or could not close them - moving on.");
  }
}

export async function handleFenixLoginRedirect(page: Page) {
  const url = page.url();
  if (url.includes("errorcode=19") || url.includes("logout")) {
    try {
      const returnBtn = page.getByText("חזרה למסך כניסה").first();
      await returnBtn.waitFor({ state: "visible", timeout: 8000 });
      await returnBtn.click({ force: true });
      await page.waitForURL("**/my.policy", { timeout: 20000 }).catch(() => {});
    } catch (e) {
      await page.goto("https://agent.fnx.co.il/my.policy", { waitUntil: "domcontentloaded" });
    }
  }
}

export async function phoenixLogin(page: Page, username: string, password: string) {
  // console.log("[Fenix] Injecting login...");
  const injection = `
    (function(u, p) {
      return new Promise(resolve => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const user = document.querySelector('#input_1');
          const pass = document.querySelector('#input_2');
          const btn  = document.querySelector('input[type="submit"], button[type="submit"], #btLogin');
          if (user && pass && btn) {
            clearInterval(interval);
            user.value = u;
            pass.value = p;
            user.dispatchEvent(new Event('input', {bubbles:true}));
            pass.dispatchEvent(new Event('input', {bubbles:true}));
            pass.dispatchEvent(new Event('change', {bubbles:true}));
            btn.click();
            resolve("SUCCESS");
          }
          if (attempts > 60) { clearInterval(interval); resolve("TIMEOUT"); }
        }, 500);
      });
    })('${username.replace(/'/g, "\\'")}', '${password.replace(/'/g, "\\'")}')
  `;
  await page.evaluate(injection);
  await page.waitForTimeout(8000);
}

export async function phoenixHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp } = ctx;
  await setStatus(runId, { status: "otp_required", step: "ממתין לקוד זיהוי", "otp.mode": "firestore" });
  const otpCode = await pollOtp(runId);
  if (!otpCode) throw new Error("OTP Timeout");

  const injection = `
    (function(code) {
      return new Promise(resolve => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const input = document.querySelector('#input_2');
          const btn = document.querySelector('input[type="submit"], button[type="submit"]');
          if (input && btn) {
            clearInterval(interval);
            input.value = code;
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
            btn.click();
            resolve("SUCCESS");
          }
          if (attempts > 40) { clearInterval(interval); resolve("TIMEOUT"); }
        }, 500);
      });
    })('${otpCode}')
  `;
  await page.evaluate(injection);
  await page.waitForTimeout(8000);
  await clearOtp(runId).catch(() => {});
}


/**
 * ניווט לתפריט "עמלות" בסיידבר (תפריט צד עצמאי, לא נמצא תחת "דוחות")
 * מתוכו יורדת תת-תפריט שכולל את "ריכוז תשלומי עמלות" (ר' navigateToPhoenixPaymentsSummary)
 */
export async function navigateToPhoenixCommissions(page: Page) {
  // console.log("[Phoenix] Navigating to Commissions (Strict Mode)...");

  await waitPhoenixLoaderGone(page, 20000);
  await page.waitForTimeout(1500);

  // לחיצה על "עמלות" בסיידבר - זהו פריט תפריט עצמאי (עם חץ הרחבה/אייקון DB),
  // לא נמצא תחת "דוחות" כפי שהונח בטעות בגרסה קודמת.
  const commsResult = await page.evaluate<string>(`
    (function() {
      // חיפוש לפי aria-label מדויק או טקסט פנימי
      const btn = document.querySelector('button[aria-label="עמלות"]') ||
                  Array.from(document.querySelectorAll('button, span, a'))
                       .find(el => el.innerText?.trim() === 'עמלות' || el.getAttribute('aria-label') === 'עמלות');

      if (btn) {
        const clickable = btn.closest('button') || btn.closest('a') || btn;
        clickable.click();
        return "SUCCESS";
      }
      return "ERROR_COMMS_NOT_FOUND";
    })()
  `);

  // console.log("[Phoenix] Commissions button result:", commsResult);

  if (commsResult.startsWith("ERROR")) {
    throw new Error("לא נמצא פריט 'עמלות' בתפריט הצד");
  }

  // אין צורך בהמתנה נוספת כאן: navigateToPhoenixPaymentsSummary כבר ממתינה בעצמה
  // (link.waitFor state:"visible") עד שהקישור "ריכוז תשלומי עמלות" בתת-התפריט
  // נחשף וניתן ללחיצה. המתנה כפולה כאן רק מוסיפה זמן מיותר.
}

/**
 * ניווט מתוך תפריט המשנה של "עמלות" אל "ריכוז תשלומי עמלות"
 * (מבוסס על ה-href: /digital-services/commissions/long-term/payments-report)
 * TODO: לוודא מול הרצה חיה שה-href/הטקסט תואמים - נלקחו מצילום מסך של ה-DOM.
 */
export async function navigateToPhoenixPaymentsSummary(page: Page) {
  // ממתינים שהקישור יופיע ב-DOM (לא בהכרח "visible" לפי ההגדרה המחמירה של
  // Playwright - התפריט עשוי להיות באנימציית פתיחה, אבל קליק ישיר על ה-DOM
  // כבר עובד גם אז - זו הסיבה שחוזרים לגישת ה-evaluate המקורית שכבר הצליחה,
  // רק עם המתנה קצרה יותר (15 שנ' במקום 30) לפני הניסיון.
  await page.waitForFunction(() => {
    return !!document.querySelector('a[href*="payments-report"]') ||
           Array.from(document.querySelectorAll('a')).some(a => (a.innerText || '').trim() === 'ריכוז תשלומי עמלות');
  }, { timeout: 15000 }).catch(() => {});

  const result = await page.evaluate<string>(`
    (function() {
      const els = Array.from(document.querySelectorAll('a, span, button'));
      const target = els.find(el => {
        const txt = (el.innerText || el.textContent || "").trim();
        const href = el.getAttribute && el.getAttribute('href');
        return txt === 'ריכוז תשלומי עמלות' || (href && href.includes('payments-report'));
      });
      if (target) {
        const clickable = target.closest('a') || target.closest('button') || target;
        clickable.click();
        return "CLICKED";
      }
      return "NOT_FOUND";
    })()
  `);

  if (result === "NOT_FOUND") {
    throw new Error('לא נמצא הקישור "ריכוז תשלומי עמלות" בתפריט העמלות');
  }

  // אישור שהניווט אכן קרה - שינוי ה-URL הוא סימן אמין ולא תלוי בניחוש מבנה ה-DOM
  await page.waitForURL(/payments-report/, { timeout: 20000 }).catch(() => {});
}


/**
 * המתנה פרימיטיבית בסגנון הזהה לקוד כלל (clal.shared.ts) - polling עצמאי
 * בתוך הדפדפן (setInterval+Promise בתוך page.evaluate), לא תלוי במנגנוני
 * ה-wait המובנים של Playwright (waitForSelector/waitForFunction) שלא
 * התגלו כאמינים ב-EXE הארוז.
 */
async function pollForSelector(
  page: Page,
  selector: string,
  maxAttempts = 30,
  intervalMs = 500
): Promise<boolean> {
  const result = await page.evaluate(`
    (function(sel, maxAttempts, intervalMs) {
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (document.querySelector(sel)) {
            clearInterval(interval);
            resolve("FOUND");
          }
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            resolve("TIMEOUT");
          }
        }, intervalMs);
      });
    })('${selector.replace(/'/g, "\\'")}', ${maxAttempts}, ${intervalMs})
  `);
  return result === "FOUND";
}



/**
 * חיפוש ובחירת חברה/סוכנות לפי ח.פ בדף "ריכוז תשלומי עמלות".
 * נקרא רק בהינתן flag (ר' runPhoenixAll) - לא כל סוכן זקוק לבחירה הזו.
 *
 * חשוב: בורר החברה הוא הרכיב fnx-nx-fnx-mat-select שיושב ליד הכותרת, צמוד לטקסט
 * "ח.פ/ת.ז" - זה NOT "סוכן מקבל עמלה" (שדה סינון אחר לגמרי שנמצא בהמשך העמוד
 * ב"פירוט תשלומים" וגרם לבאג בגרסה קודמת). כמו כן יש בעמוד כמה אלמנטים שונים עם
 * aria-label="חיפוש" (חיפוש לקוחות גלובלי בפינה ועוד), ורק אחד מהם - זה שבתוך
 * ה-listbox שנפתח מבורר החברה - הוא הנכון, ולכן כל הפעולות מוגבלות (scoped) אליו.
 */
export async function phoenixSearchAndSelectCompany(page: Page, taxId: string) {
  if (!taxId) {
    // console.warn("[Phoenix] No taxId provided for company search - skipping");
    return;
  }
  // 0. פתיחת בורר החברה - הרכיב fnx-nx-fnx-mat-select שיושב ליד הכותרת, צמוד
  //    לטקסט "ח.פ/ת.ז" (לא "סוכן מקבל עמלה" בפירוט התשלומים - זה שדה סינון אחר
  //    לגמרי, זו הייתה טעות בגרסה קודמת).
  //    חשוב: לא ניתן להשתמש בקליק "אמיתי" של Playwright (elementHandle.click())
  //    בסביבת ה-EXE - זה גורם לשגיאת "not well-serializable". חייבים להישאר עם
  //    קוד מוזרק כמחרוזת בלבד, כמו בכל שאר הקובץ. במקום .click() בודד, מדמים
  //    רצף אירועי עכבר מלא (pointerdown/mousedown/pointerup/mouseup/click) -
  //    זה עדיין קוד בתוך מחרוזת, לא פונקציה שמועברת ל-Playwright.

  const openComboResult = await page.evaluate<string>(`
    (function() {
      const spans = Array.from(document.querySelectorAll('span'));
      const idSpan = spans.find(el => {
        const txt = (el.innerText || el.textContent || '').trim();
        return txt.includes('ח.פ') && txt.includes('ת.ז');
      });
      if (!idSpan) return "ID_SPAN_NOT_FOUND";

      const container = idSpan.closest('span.flex') || idSpan.parentElement;
      if (!container) return "CONTAINER_NOT_FOUND";

      const matSelect = container.querySelector('fnx-nx-fnx-mat-select');
      if (!matSelect) return "MATSELECT_NOT_FOUND";

      const specificTrigger = matSelect.querySelector('[role="combobox"], mat-select, .mat-mdc-select-trigger');
      const target = specificTrigger || matSelect;

      target.scrollIntoView({ block: 'center' });
      const rect = target.getBoundingClientRect();
      const opts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      };
      target.dispatchEvent(new MouseEvent('pointerdown', opts));
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      target.dispatchEvent(new MouseEvent('pointerup', opts));
      target.dispatchEvent(new MouseEvent('mouseup', opts));
      target.dispatchEvent(new MouseEvent('click', opts));

      return "CLICKED";
    })()
  `);

  if (openComboResult === "ID_SPAN_NOT_FOUND") {
    throw new Error('לא נמצא ה-span עם הטקסט "ח.פ/ת.ז" ליד כותרת הדוח');
  }
  if (openComboResult === "CONTAINER_NOT_FOUND") {
    throw new Error('נמצא ה-span "ח.פ/ת.ז" אך לא נמצא קונטיינר משותף מסביבו');
  }
  if (openComboResult === "MATSELECT_NOT_FOUND") {
    throw new Error('נמצא הקונטיינר של "ח.פ/ת.ז" אך לא נמצא בתוכו הרכיב fnx-nx-fnx-mat-select');
  }

  // 1. המתנה לפתיחת ה-listbox (פאנל הבחירה של Angular Material).
  //    חשוב: יש בעמוד שני אלמנטים עם role="listbox" בו-זמנית - הפאנל החיצוני
  //    (עם המחלקה mat-mdc-select-panel, מכיל את שדה החיפוש) ובתוכו עוד listbox
  //    פנימי (class="options-container", מכיל רק אופציות, בלי שדה חיפוש). מעגנים
  //    במפורש למחלקה הספציפית כדי לא להתבלבל בין השניים.
 const PANEL_SELECTOR = 'div[role="listbox"].mat-mdc-select-panel';

  // ממתינים ישירות לשדה החיפוש עצמו (לא לבדיקת "הרשימה קיימת" בנפרד) - זה מה
  // שבאמת צריך בשביל הצעד הבא, אז עדיף לחכות לו ישירות.
    const inputReady = await pollForSelector(
    page,
    'div[role="listbox"].mat-mdc-select-panel input[aria-label="חיפוש"]',
    30,
    500
  );

  if (!inputReady) {
    throw new Error('בורר החברה (ליד "ח.פ/ת.ז") נלחץ אך שדה החיפוש בתוך הפאנל לא נמצא');
  }

  const openInputResult = await page.evaluate<string>(`
    (function() {
      const listbox = document.querySelector('div[role="listbox"].mat-mdc-select-panel');
      const input = listbox ? listbox.querySelector('input[aria-label="חיפוש"], input[aria-label*="חיפוש"]') : null;
      if (input) {
        input.click();
        input.focus();
        return "FOUND";
      }
      return "NOT_FOUND";
    })()
  `);

  if (openInputResult === "NOT_FOUND") {
    throw new Error('לא נמצא שדה חיפוש בתוך פאנל בורר החברה');
  }

  await page.waitForTimeout(300);

  // 3. הקלדת הח.פ תו-תו (מדמה הקלדת משתמש כדי להפעיל autocomplete/סינון)
  await page.keyboard.type(taxId, { delay: 70 });

  // 4. המתנה לתוצאה תואמת בתוך הפאנל, ואז לחיצה עליה
  const found = await waitForSelectorFast(
    page,
    `${PANEL_SELECTOR} :text("${taxId}")`,
    8000,
    "attached"
  ).catch(() => false);

  const selectResult = await page.evaluate<string>(`
    (function(id) {
      const listbox = document.querySelector('div[role="listbox"].mat-mdc-select-panel');
      if (!listbox) return "LISTBOX_GONE";
      const options = Array.from(listbox.querySelectorAll('mat-option'));
      const match = options.find(el => (el.innerText || el.textContent || '').includes(id));
      if (match) {
        match.click();
        return "SELECTED";
      }
      return "NOT_FOUND";
    })('${taxId.replace(/'/g, "\\'")}')
  `);

  if (selectResult === "NOT_FOUND" || selectResult === "LISTBOX_GONE") {
    throw new Error(`לא נמצאה/נבחרה תוצאה מתאימה לח.פ ${taxId} בתוך פאנל בורר החברה (${selectResult})`);
  }

  await waitPhoenixLoaderGone(page, 15000);
}

/**
 * פתיחת תת-דוח בתוך עמוד "ריכוז תשלומי עמלות" - כל תת-הדוחות פותחים טאב חדש (אושר בבדיקה חיה).
 * ההתאמה נעשית לפי מילות מפתח (include/exclude) ולא לפי טקסט מדויק, כי כמה מתת-הדוחות
 * דומים מאוד בטקסט שלהם (למשל "נפרעים והפרשי סוכנויות גמל" מול "הפרשי סוכנויות נפרעים")
 * ותלות בסדר תווים/סוגריים מדויק (שמושפע מכיוון RTL) עלולה להיות שברירית.
 */
export type ReportMatch = { include: string[]; exclude?: string[]; exact?: string };

export async function phoenixOpenReportByMatch(mainPage: Page, match: ReportMatch): Promise<Page> {
  const context = mainPage.context();
  // נתחיל להאזין לפתיחת דף חדש לפני הלחיצה
  const pagePromise = context.waitForEvent('page', { timeout: 20000 }).catch(() => null);

  const openScript = `
    (function() {
    const include = ${JSON.stringify(match.include)};
      const exclude = ${JSON.stringify(match.exclude || [])};
      const exact = ${JSON.stringify(match.exact || null)};
      const elements = Array.from(document.querySelectorAll('li span, a span, span, button, a'));
      const matches = elements.filter(el => {
        const txt = (el.innerText || el.textContent || "").trim();
        if (!txt) return false;
        if (exact !== null) return txt === exact;
        const hasAllInclude = include.every(k => txt.includes(k));
        const hasNoExclude = exclude.every(k => !txt.includes(k));
        return hasAllInclude && hasNoExclude;
      });

      if (matches.length === 0) return "NOT_FOUND";
      if (matches.length > 1) {
        // בטיחות: אם יש כמה שורות מתאימות - לא לוחצים על הראשונה בעיוורון,
        // אלא נכשלים בבירור. עדיף ריצה שנכשלת מאשר הורדת דוח כספי שגוי.
        const texts = matches.map(el => (el.innerText || el.textContent || "").trim());
        return "AMBIGUOUS::" + JSON.stringify(texts);
      }

      const target = matches[0];
      target.scrollIntoView({ block: 'center' });
      const clickable = target.closest('button') || target.closest('a') || target;
      clickable.click();
      return "CLICKED";
    })()
  `;

  const res = await mainPage.evaluate<string>(openScript);

  if (res === "NOT_FOUND") {
    throw new Error(`דוח עם מילות המפתח ${JSON.stringify(match)} לא נמצא בדף ריכוז תשלומי עמלות`);
  }
  if (res.startsWith("AMBIGUOUS::")) {
    const texts = res.slice("AMBIGUOUS::".length);
    throw new Error(`נמצאה יותר מהתאמה אחת עבור מילות המפתח ${JSON.stringify(match)} - צריך קריטריון מדויק יותר. שורות שנמצאו: ${texts}`);
  }

  const newPage = await pagePromise;

  if (newPage) {
    await newPage.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
    await waitPhoenixLoaderGone(newPage, 20000);
    return newPage;
  }

  // גיבוי: אם בכל זאת לא נפתח טאב חדש (למשל שינוי עתידי באתר)
  return mainPage;
}

/**
 * פתיחת דוח בטאב חדש
 */
/**
 * פותח דוח – תומך גם בטאב חדש וגם באותו טאב
 */


export async function phoenixOpenReport(mainPage: Page, reportName: string): Promise<Page> {
  // console.log(`[Phoenix] Opening report "${reportName}"...`);

  const context = mainPage.context();
  // נתחיל להאזין לפתיחת דף חדש לפני הלחיצה
  const pagePromise = context.waitForEvent('page', { timeout: 20000 }).catch(() => null);

  // הזרקת המשתנה כטקסט נקי כדי לעקוף בעיות Serialization ב-EXE
  // השתמשתי ב-JSON.stringify כדי לטפל בגרשיים בתוך שם הדוח אם יש כאלו
  const openScript = `
    (function() {
      const nameToFind = ${JSON.stringify(reportName.trim())};
      const elements = Array.from(document.querySelectorAll('li span, a span, span, button, a'));
      const target = elements.find(el => {
        const txt = el.innerText || el.textContent || "";
        return txt.trim() === nameToFind;
      });

      if (target) {
        target.scrollIntoView({ block: 'center' });
        // מחפשים את האלמנט הקליקבילי הקרוב ביותר (כפתור או לינק)
        const clickable = target.closest('button') || target.closest('a') || target;
        clickable.click();
        return "CLICKED";
      }
      return "NOT_FOUND";
    })()
  `;

  const res = await mainPage.evaluate<string>(openScript);
  // console.log(`[Phoenix] Open report click result: ${res}`);

  if (res === "NOT_FOUND") {
    throw new Error(`הדוח "${reportName}" לא נמצא בדף העמלות`);
  }

  // מחכים לראות אם נפתח טאב חדש (כפי שקורה בדרך כלל בפניקס)
  const newPage = await pagePromise;

  if (newPage) {
    // console.log("[Phoenix] New tab detected for the report.");
    await newPage.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
    // חשוב לוודא שהלואדר בדף החדש נעלם לפני שממשיכים
    await waitPhoenixLoaderGone(newPage, 20000);
    return newPage;
  }

  // console.log("[Phoenix] No new tab detected, continuing with current page.");
  return mainPage;
}


/**
 * הורדת אקסל: גרסת String Injection - חסינה לשגיאות Serialization ב-EXE
 * שינוי: במקום להמתין ל"היעלמות לואדר כללית" (שיכולה להימתח על עשרות שניות
 * גם כשהדוח כבר גלוי ומוכן), ממתינים ישירות ובאופן ממוקד לכפתור/אייקון האקסל.
 */
export async function phoenixExportExcel(page: Page): Promise<Download | null> {
  // console.log("[Phoenix] Starting Excel Export process...");

  try {
    // המתנה ממוקדת לכפתור האקסל עצמו, לא ללואדר כללי - זה החלק שאמור לקצר
    // משמעותית את ההמתנה כשהדוח בפועל כבר טעון וגלוי.
    const excelReady = await waitForSelectorFast(
      page,
      'fnx-nx-client-gemel-continuous-table-export-to-excel button, fnx-nx-client-continuous-table-export-to-excel button, img[src*="excel"]',
      15000
    );

    if (!excelReady) {
      // רשת אחרונה: אם לא הגענו לכפתור במהירות, נותנים עוד צ'אנס עם המתנת לואדר קצרה
      await waitPhoenixLoaderGone(page, 15000);
    }

    // 1. הכנת ההאזנה להורדה (חייב לקרות לפני הלחיצה)
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });

    // 2. הזרקת קוד כטקסט (זה עוקף את שגיאת ה-not well-serializable)
    const injectionScript = `
      (function() {
        // איתור כפתור האקסל - תומך בכמה מבנים שונים שראינו באתר:
        // 1. קונטיינרים ישנים (fnx-nx-client-...-export-to-excel)
        // 2. תמונת אקסל עטופה ב-button (fnx-nx-ui-standalone-icon > img[src*="excel.svg"])
        const container = document.querySelector('fnx-nx-client-gemel-continuous-table-export-to-excel, fnx-nx-client-continuous-table-export-to-excel');
        let mainBtn = container ? container.querySelector('button') : null;

        if (!mainBtn) {
          const img = document.querySelector('img[src*="excel"]');
          mainBtn = img ? (img.closest('button') || img) : null;
        }

        if (!mainBtn) return "NOT_FOUND";

        // לחיצה על הכפתור (לא רק על התמונה שבתוכו)
        mainBtn.click();

        // בדיקה אחרי 2.5 שניות אם נפתח תפריט "מורחב"
        setTimeout(() => {
          const menuItems = Array.from(document.querySelectorAll('.mat-mdc-menu-item, .mat-menu-item, [role="menuitem"]'));
          const extended = menuItems.find(el => {
            const txt = el.innerText || el.textContent || "";
            return txt.includes("מורחב");
          });

          if (extended) {
            // console.log("Phoenix: Extended menu found, clicking...");
            extended.click();
          }
        }, 2000);

        return "CLICKED_MAIN";
      })()
    `;

    const res = await page.evaluate(injectionScript);
    // console.log(`[Phoenix] Export script injected: ${res}`);

    if (res === "NOT_FOUND") {
      // console.error("[Phoenix] Excel icon not found in DOM");
      return null;
    }

    // 3. המתנה להורדה
    return await downloadPromise;

  } catch (e) {
    // console.error("[Phoenix] Export failed:", e);
    return null;
  }
}