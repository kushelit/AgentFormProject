import type { Page, Download } from "playwright";
import type { RunnerCtx } from "../../types";

export async function waitMenoraLoaderGone(page: Page, timeoutMs = 30000) {
  try {
    const loaderScript = `() => {
      const selectors = ['.loading', '.spinner', '.overlay', 'menora-loader', '.k-loading-mask'];
      const nodes = selectors.flatMap(sel => Array.from(document.querySelectorAll(sel)));
      return nodes.every(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden' || el.offsetWidth === 0;
      });
    }`;
    await page.waitForFunction(loaderScript, { timeout: timeoutMs }).catch(() => {});
  } catch (e) {}
}

/**
 * לוגין מנורה: שם משתמש וטלפון
 */
/**
 * לוגין מנורה: הזרקה חזקה שמעדכנת את ה-State של האתר
 */
/**
 * לוגין מנורה: הזרקת "כוח" שעוקפת וולידציה של Angular/React
 */
/**
 * לוגין מנורה: הזרקה עקשנית שמוודאת שהערך לא נמחק ע"י האתר
 */
export async function menoraLogin(page: Page, username: string, phoneNumber: string) {
  console.log("[Menora] Injecting credentials with Persistence Check...");

  const injection = `
    (async function(u, p) {
      async function fillAndVerify(selector, val) {
        const el = document.querySelector(selector);
        if (!el) return false;
        
        // שלב 1: פוקוס וניקוי
        el.focus();
        el.value = '';
        
        // שלב 2: הזנה באמצעות insertText (הכי אמין)
        document.execCommand('insertText', false, val);
        
        // שלב 3: שליחת אירועים
        const events = ['input', 'change', 'blur'];
        events.forEach(name => el.dispatchEvent(new Event(name, { bubbles: true })));

        // שלב 4: בדיקה שהערך נשאר (מניעת איפוס ע"י Angular)
        return new Promise((resolve) => {
          setTimeout(() => {
            if (el.value === val) {
              resolve(true);
            } else {
              el.value = val; // גיבוי אחרון
              el.dispatchEvent(new Event('input', { bubbles: true }));
              resolve(true);
            }
          }, 500);
        });
      }

      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        
        // מנסים למצוא את השדות
        const userField = document.querySelector('input#username, input[name="username"]');
        const phoneField = document.querySelector('input#phoneNumber, input[name*="phone"]');
        const btn = document.querySelector('button[type="submit"], .login-btn');

        if (userField && phoneField && btn) {
          clearInterval(interval);
          
          // הזנה עקשנית
          await fillAndVerify('input#username, input[name="username"]', u);
          await new Promise(r => setTimeout(r, 400)); // נשימה בין השדות
          await fillAndVerify('input#phoneNumber, input[name*="phone"]', p);

          // לחיצה על מקום ריק כדי לסגור ולידציות
          document.body.click();

          setTimeout(() => {
            if (!btn.disabled || btn.classList.contains('active')) {
               btn.click();
            } else {
               // אם הכפתור עדיין נעול, ננסה "לשחרר" אותו ידנית
               btn.removeAttribute('disabled');
               btn.click();
            }
          }, 1000);
        }

        if (attempts > 60) clearInterval(interval);
      }, 1000);
    })('${username}', '${phoneNumber}')
  `;

  await page.evaluate(injection);
  // המתנה ארוכה יותר כדי לוודא שהדף הבא נטען
  await page.waitForTimeout(8000);
}


/**
 * OTP מנורה: הזרקה חזקה שמפעילה את ה-Auto-Submit של האתר
 */
export async function menoraHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp } = ctx;
  
  await setStatus(runId, { 
    status: "otp_required", 
    step: "ממתין לקוד אימות ממנורה (SMS)", 
    "otp.mode": "firestore" 
  });

  const otpCode = await pollOtp(runId);
  if (!otpCode) throw new Error("OTP Timeout: הקוד לא התקבל.");

  console.log(`[Menora] Code received: ${otpCode}, injecting...`);

  const injection = `
    (function(code) {
      const input = document.querySelector('input[id^="otp-input"], input[name*="otp"], .otp-field input');
      if (!input) return "INPUT_NOT_FOUND";

      input.focus();
      input.click();
      input.value = ''; // ניקוי

      // הזרקה שמדמה הקלדה אמיתית ומעוררת את ה-Auto-Submit
      document.execCommand('insertText', false, code);

      // שליחת אירועים אגרסיבית כדי שהאתר יזהה שהגענו ל-6 ספרות
      const events = ['input', 'change', 'keyup', 'keydown', 'blur'];
      events.forEach(name => {
        input.dispatchEvent(new Event(name, { bubbles: true }));
      });

      // לחיצה על מקום ריק כדי "לשחרר" את השדה (לפעמים זה מה שמפעיל את ה-Submit)
      document.body.click();

      return "INJECTED";
    })('${otpCode}')
  `;

  const res = await page.evaluate(injection);
  console.log(`[Menora] OTP Injection Result: ${res}`);

  // המתנה לראות אם האתר עבר דף (Auto-Submit)
  try {
    // אנחנו מחכים שהלוגו של מנורה בפנים יופיע או שה-URL ישתנה
    await page.waitForFunction(() => {
      return !!document.querySelector('a.logo[href*="agents-site"], .user-profile, [class*="dashboard"]');
    }, { timeout: 15000 });
    console.log("[Menora] OTP Auto-Submit successful ✅");
  } catch (e) {
    console.log("[Menora] OTP did not auto-submit, checking if button is needed...");
    // גיבוי: אם יש כפתור אישור שבכל זאת הופיע, נלחץ עליו
    await page.evaluate(`
      const btn = document.querySelector('button[type="submit"], .approve-btn, button:has-text("כניסה")');
      if (btn) btn.click();
    `).catch(() => {});
  }

  await clearOtp(runId).catch(() => {});
}


/**

 * ניווט לעמלות: לחיצה על האייקון לפי ה-SRC המדויק מה-Inspector
 */
/**
 * ניווט לעמלות: קפיצה ישירה ללינק או לחיצה על טקסט מדויק בלבד
 */
/**
 * ניווט לעמלות: גרסה סבלנית ומדויקת לפי ה-Inspector של מנורה (image_4f2ea8)
 * עוקפת בעיות Serialization ב-EXE.
 */
export async function menoraNavigateToCommissions(page: Page) {
  const targetUrl = "https://menoranet.menora.co.il/agent-financial-info/commissions";
  
  console.log(`[Menora] Attempting direct jump to commissions...`);
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await waitMenoraLoaderGone(page);

  // גיבוי לניווט ויזואלי (אם הקפיצה הישירה נכשלת)
  if (!page.url().includes("agent-financial-info/commissions")) {
    console.log("[Menora] Direct jump failed. Attempting strict sidebar navigation...");
    
    // לחיצה מדויקת על אייקון עמלות
    await page.evaluate(`
      (function() {
        const icon = document.querySelector('img[src*="commissions-icon"], .commissions-icon');
        if (icon) {
          const link = icon.closest('a') || icon.closest('button') || icon;
          link.click();
        }
      })()
    `);
    await page.waitForTimeout(2000);

    // לחיצה על הקישור הראשי של עמלות (טקסט מדויק למניעת כניסה להסכמים)
    await page.evaluate(`
      (function() {
        const el = Array.from(document.querySelectorAll('span, a')).find(e => e.textContent.trim() === 'עמלות');
        if (el) el.click();
      })()
    `);
    await page.waitForURL("**/agent-financial-info/commissions", { timeout: 20000 }).catch(() => {});
  }

  // =========================================================================
  // --- תיקון השגיאה: לחיצה על לשונית "דוחות" (image_4f2ea8) ---
  // =========================================================================
  console.log("[Menora] Activating 'דוחות' tab (Polling Mode for EXE stabilization)...");

  // הזרקת קוד אקטיבי שסורק את ה-DIV שצילמת ומחכה שהכפתור יופיע ויהיה גלוי
  const reportsTabScript = `
    (function() {
      return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 30; // 15 שניות של ניסיונות

        const interval = setInterval(() => {
          attempts++;

          // סלקטור ממוקד מה-Inspector: button עם הקלאס menora-sub-header-btn
          // שמכיל טקסט פנימי "דוחות"
          const subHeaderButtons = Array.from(document.querySelectorAll('button.menora-sub-header-btn'));
          const reportsTab = subHeaderButtons.find(el => el.innerText.trim() === 'דוחות');

          if (reportsTab && reportsTab.offsetWidth > 0) {
            clearInterval(interval);
            console.log("Menora: 'דוחות' tab found. Clicking robustly...");

            // לחיצה אגרסיבית שמעדכנת את אנגולר
            reportsTab.removeAttribute('disabled'); // לוודא שלא נעול
            reportsTab.click();
            reportsTab.dispatchEvent(new Event('click', { bubbles: true }));

            resolve("SUCCESS_CLICKED_TAB");
          }

          if (attempts >= maxAttempts) {
            clearInterval(interval);
            resolve("ERROR_TIMEOUT_WAITING_FOR_REPORTS_TAB");
          }
        }, 500);
      });
    })()
  `;

  const tabResult = await page.evaluate<string>(reportsTabScript);
  console.log(`[Menora] Reports tab activation result: ${tabResult}`);

  if (tabResult.startsWith("ERROR")) {
    // מנורה לעיתים מחביאה את הלשונית הזו אם אין נתונים. במקרה כזה לא נזרוק שגיאה קריטית
    console.log("[Menora] Warning: Could not activate 'דוחות' tab. Checking for production form anyway.");
  }

  // המתנה קצרה אחרי לחיצה שהטופס למטה יתרנדר
  await page.waitForTimeout(3000);
  await waitMenoraLoaderGone(page);
}

/**
 * בחירת סוכנים והפקת דוח
 */
export async function menoraProduceReport(page: Page) {
  console.log("[Menora] Selecting agents and producing report...");

  // 1. פתיחת בחירת ישות (image_febcb0) וסימון "סוכנים" (image_febd65)
  const selectScript = `
    (function() {
      const toggle = document.querySelector('.expansion-icon, .dropdown-toggle, [class*="select"]');
      if (toggle) toggle.click();
      
      setTimeout(() => {
        const checkbox = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('סוכנים'))?.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // לחיצה מחוץ ל-dropdown לסגירה
        document.body.click();
      }, 1000);
    })()
  `;
  await page.evaluate(selectScript);
  await page.waitForTimeout(2000);

  // 2. לחיצה על הפקת דוח (image_fec08f)
  await page.evaluate(`
    Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('הפקת הדוח'))?.click()
  `);
  console.log("[Menora] Report production triggered.");
  await page.waitForTimeout(5000);
}

/**
 * המתנה להורדה מרשימת הדוחות (Polling)
 */
export async function menoraDownloadZip(page: Page): Promise<Download | null> {
  console.log("[Menora] Waiting for report to be ready (Polling history)...");

  for (let i = 0; i < 15; i++) { // עד 15 ניסיונות (75 שניות)
    const status = await page.evaluate(`
      (function() {
        const row = document.querySelector('tr, .report-row'); // השורה הראשונה בהיסטוריה
        if (!row) return "NOT_FOUND";
        const statusText = row.innerText;
        if (statusText.includes('הסתיים') || row.querySelector('img[src*="download"], .download-icon')) {
          return "READY";
        }
        return "PROCESSING";
      })()
    `);

    if (status === "READY") {
      console.log("[Menora] Report is ready! Clicking download...");
      const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
      
      await page.evaluate(`
        const btn = document.querySelector('img[src*="download"], .download-icon, [class*="download"]');
        if (btn) btn.click();
      `);
      
      return await downloadPromise;
    }

    console.log(`[Menora] Report still processing... (Attempt ${i+1})`);
    await page.waitForTimeout(5000);
    // לחיצה על רענון פנימי אם קיים, או פשוט מחכים
    await page.evaluate(`document.querySelector('.refresh-icon')?.click()`).catch(() => {});
  }
  
  throw new Error("הפקת הדוח במנורה ארכה זמן רב מדי.");
}