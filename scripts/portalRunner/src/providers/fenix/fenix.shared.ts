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
    console.log("[Phoenix] Loader timeout - continuing");
  }
}

/**
 * פונקציה חדשה: סגירת הפופ-אפ שחוסם את המסך (זה בסדר / חסימה)
 */
async function closeInitialModals(page: Page) {
  console.log("[Phoenix] Checking for blocking modals...");
  try {
    // לחיצה על "זה בסדר" (או כפתור אישור דומה בפופ-אפ)
    const approveBtn = page.locator('button:has-text("זה בסדר"), button:has-text("אישור")').first();
    if (await approveBtn.isVisible({ timeout: 5000 })) {
      console.log("[Phoenix] Closing modal: Clicking 'זה בסדר'");
      await approveBtn.click({ force: true });
      await page.waitForTimeout(2000);
    }
    
    // סגירת פופ-אפ נוסף עם X אם קיים (לפי image_b608ee יש X קטן למעלה)
    const xBtn = page.locator('button .icon-close, .modal-close, [aria-label="Close"]').first();
    if (await xBtn.isVisible({ timeout: 2000 })) {
        await xBtn.click({ force: true });
    }
  } catch (e) {
    console.log("[Phoenix] No modals found or could not close them - moving on.");
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
  console.log("[Fenix] Injecting login...");
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
 * ניווט לדף עמלות: דוחות -> עמלות
 * התיקון: שימוש במחרוזות (Strings) למניעת שגיאת Serialization ב-EXE
 */
export async function navigateToPhoenixCommissions(page: Page) {
  console.log("[Phoenix] Navigating to Commissions – using aria-label priority...");

  await waitPhoenixLoaderGone(page, 30000);
  await page.waitForTimeout(5000); // נותן זמן להתנדפות F5 וטעינת תפריט

  // 1. לחיצה על "דוחות" – עדיפות ל-aria-label + טקסט מדויק
  await page.evaluate(`
    const candidates = Array.from(document.querySelectorAll('button, span, a, div'));
    
    // עדיפות ראשונה: aria-label
    let btn = candidates.find(el => 
      el.getAttribute('aria-label')?.includes('דוחות')
    );
    
    // fallback: טקסט מדויק
    if (!btn) {
      btn = candidates.find(el => 
        (el.textContent || '').trim() === 'דוחות' && 
        !el.closest('.active, .sidebar')
      );
    }
    
    if (btn) {
      btn.scrollIntoView({block: 'center'});
      btn.click();
    } else {
      console.warn("לא נמצא כפתור 'דוחות'");
    }
  `);

  await page.waitForTimeout(4000); // המתנה להתרחבות התפריט
  await waitPhoenixLoaderGone(page, 20000);

  // 2. לחיצה על "עמלות" – עדיפות גבוהה ל-aria-label
  await page.evaluate(`
    const candidates = Array.from(document.querySelectorAll('button, span, a, div'));
    
    // עדיפות 1: aria-label שמכיל "עמלות" (הכי מדויק)
    let target = candidates.find(el => 
      el.getAttribute('aria-label')?.includes('עמלות')
    );
    
    // עדיפות 2: טקסט מדויק + לא בתוך תביעות
    if (!target) {
      target = candidates.find(el => {
        const txt = (el.textContent || el.getAttribute('title') || '').trim();
        const parentTxt = el.closest('li, div')?.textContent || '';
        return (txt === 'עמלות' || txt.includes('עמלות נפרעים')) &&
               !parentTxt.includes('תביעות') &&
               !el.closest('[class*="claims"], [class*="תביעות"], [aria-label*="תביעות"]');
      });
    }
    
    if (target) {
      target.scrollIntoView({block: 'center'});
      target.click();
    } else {
      console.warn("לא נמצא כפתור 'עמלות' תקין");
    }
  `);

  // 3. המתנה ארוכה + בדיקה אם הגענו למקום הנכון
  await page.waitForTimeout(10000); // 10 שניות – הדף נפתח מהר אבל צריך ייצוב
  await waitPhoenixLoaderGone(page, 45000);

  const isInCommissions = await page.evaluate(() => {
    const txt = document.body.innerText;
    return txt.includes('עמלות נפרעים') ||
           txt.includes('ריכוז עמלות') ||
           document.querySelector('img[src*="excel"]') ||  // כפתור אקסל = סימן מצוין
           document.querySelector('[aria-label*="עמלות"]');
  });

  if (!isInCommissions) {
    console.warn("[Phoenix] נראה שלא הגענו לדוח עמלות – אולי נכנסנו לתביעות");
  } else {
    console.log("[Phoenix] הגענו לדוח עמלות בהצלחה");
  }
}

/**
 * פתיחת דוח בטאב חדש
 */
/**
 * פותח דוח – תומך גם בטאב חדש וגם באותו טאב
 */
export async function phoenixOpenReport(mainPage: Page, reportName: string): Promise<Page> {
  console.log(`[Phoenix] Opening report "${reportName}"...`);

  // 1. שמירת מצב לפני לחיצה
  const context = mainPage.context();
  const existingPages = context.pages().length;
  const pagePromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);

  // 2. לחיצה על הדוח (הזרקה מדויקת)
  await mainPage.evaluate((name) => {
    const el = Array.from(document.querySelectorAll('span, a, div, li, button'))
      .find(e => (e.textContent || '').trim().includes(name) && !e.closest('.sidebar'));
    
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'center' });
      el.click();
    }
  }, reportName);

  // 3. המתנה קצרה + בדיקה אם נפתח טאב חדש
  await mainPage.waitForTimeout(3000);

  const newPage = await pagePromise;
  if (newPage) {
    console.log("[Phoenix] New tab detected for report");
    await newPage.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
    await waitPhoenixLoaderGone(newPage, 30000);
    return newPage;
  }

  // 4. אם לא נפתח טאב חדש – ממשיכים עם הדף הנוכחי
  console.log("[Phoenix] Report opened in same tab");
  await mainPage.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
  await waitPhoenixLoaderGone(mainPage, 30000);
  await mainPage.waitForTimeout(5000); // נשימה ארוכה יותר

  // 5. בדיקה אם באמת נטען הדוח (לפי כפתור אקסל או טקסט ייחודי)
  const hasExcelBtn = await mainPage.evaluate(() => {
    return !!document.querySelector('img[src*="excel"], [title*="אקסל"], button:has-text("אקסל")');
  });

  if (!hasExcelBtn) {
    console.warn("[Phoenix] No Excel button after open – possible wrong page or loader issue");
  }

  return mainPage;
}

/**
 * הורדת אקסל (האייקון מהתמונה)
 */
export async function phoenixExportExcel(page: Page): Promise<Download | null> {
  try {
    await waitPhoenixLoaderGone(page, 30000);
    await page.waitForTimeout(3000);

    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });

    // ניסיון 1: תמונת אקסל
    let clicked = await page.evaluate(() => {
      const img = document.querySelector('img[src*="excel.svg"], img[alt*="Excel"]');
      if (img instanceof HTMLElement) {
        img.click();
        return true;
      }
      return false;
    });

    // ניסיון 2: כפתור עם טקסט או title
    if (!clicked) {
      clicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button, a, span, div'))
          .find(el => {
            const txt = (el.textContent || el.getAttribute('title') || '').toLowerCase();
            return txt.includes('אקסל') || txt.includes('excel') || el.className.includes('export');
          });
        if (btn instanceof HTMLElement) {
          btn.click();
          return true;
        }
        return false;
      });
    }

    if (!clicked) {
      console.warn("[Phoenix] No Excel button clicked");
      return null;
    }

    console.log("[Phoenix] Excel button clicked – waiting for download...");
    return await downloadPromise;

  } catch (e) {
    console.error("[Phoenix] Export failed:", e);
    return null;
  }
}