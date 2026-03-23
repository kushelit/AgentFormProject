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
 * ניווט לעמלות: גרסה סבלנית ומדויקת לפי ה-Inspector של מנורה (image_4f2ea8)
 * עוקפת בעיות Serialization ב-EXE.
 */
/**
 * ניווט לעמלות ולחיצה על לשונית דוחות
 */
export async function menoraNavigateToCommissions(page: Page) {
  const targetUrl = "https://menoranet.menora.co.il/agent-financial-info/commissions";
  
  console.log(`[Menora] Navigating to: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await waitMenoraLoaderGone(page);

  console.log("[Menora] Attempting to click 'דוחות' tab...");

  // הזרקת קוד כמחרוזת טקסט - זה פותר את כל שגיאות ה-innerText וה-Serialization
  const script = `
    (function() {
      // מחפשים את האלמנט שצילמת ב-Inspector (כפתור עם טקסט דוחות)
      const elements = Array.from(document.querySelectorAll('button, [role="tab"], .MuiTab-root, span'));
      const target = elements.find(el => {
        const txt = (el.innerText || el.textContent || "").trim();
        return txt === 'דוחות';
      });
      
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.click();
        return "SUCCESS";
      }
      return "NOT_FOUND";
    })()
  `;

  const res = await page.evaluate(script);
  console.log("[Menora] Tab activation result: " + res);

  if (res === "NOT_FOUND") {
    throw new Error("לא נמצאה לשונית 'דוחות' בדף העמלות");
  }

  await page.waitForTimeout(3000);
  await waitMenoraLoaderGone(page);
}


/**
 * בחירת סוכנים והפקת דוח - מבוסס על זיהוי טקסט וניווט לעץ ה-DOM
 */
/**
 * בחירת סוכנים והפקת דוח - גרסה משולבת וחסינה
 */
export async function menoraProduceReport(page: Page) {
  console.log("[Menora] Producing report – selecting 'סוכנים' & strong dropdown close...");

  const script = `
    (async function() {
      // שלב 1: פתיחת הדרופדאון של "בחירת ישות"
      const expandIcon = document.querySelector('svg[data-testid="ExpandMoreIcon"]');
      if (expandIcon && expandIcon.parentElement) {
        expandIcon.parentElement.click();
      } else {
        const trigger = document.querySelector('[role="combobox"], [aria-haspopup="listbox"]');
        if (trigger) trigger.click();
      }
      await new Promise(r => setTimeout(r, 1500));

      // שלב 2: בחירת "סוכנים" – הלוגיקה שעבדה לך
      const allSpans = Array.from(document.querySelectorAll('span, p, label'));
      const agentsSpan = allSpans.find(s => (s.innerText || s.textContent || "").trim() === 'סוכנים');
      
      if (agentsSpan) {
        console.log("Menora: Found 'סוכנים' span");
        
        const row = agentsSpan.closest('li, [role="option"], label, .MuiMenuItem-root');
        if (row) {
          const checkbox = row.querySelector('input[type="checkbox"]');
          if (checkbox) {
            if (!checkbox.checked) {
              checkbox.click();
              console.log("Menora: Checkbox clicked successfully");
            }
          } else {
            row.click();
            console.log("Menora: Clicked on 'סוכנים' row");
          }
        }
      } else {
        console.warn("לא נמצא 'סוכנים' בדרופדאון");
      }

      // שלב 3: סגירה חזקה של הדרופדאון (השיטה שעבדה לך)
      console.log("Menora: Closing dropdown strongly...");
      const backdrop = document.querySelector('.MuiBackdrop-root, .MuiModal-backdrop');
      if (backdrop) {
        backdrop.click();
      }
      document.body.click(); // קליק נוסף על body – סגירה בטוחה
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 2000)); // המתנה שהדרופדאון ייסגר לגמרי

      // שלב 4: לחיצה על "הפקת הדוח"
            // שלב 4: לחיצה על "הפקת הדוח" – חיפוש לפי אייקון Excel + טקסט
      let produceBtn = null;
      
      // עדיפות 1: חיפוש button שמכיל img עם alt="excel" או src עם excel
const excelImgs = document.querySelectorAll('img[alt="excel"], img[src*="excel"], img[src*="excel.svg"]');
      for (let img of excelImgs) {
        const parentBtn = img.closest('button');
        if (parentBtn) {
          // אם מצאנו button עם אייקון Excel – נלחץ עליו גם אם הטקסט לא מושלם
          produceBtn = parentBtn;
          console.log("Menora: Found button via Excel icon – no text check needed");
          break;
        }
      }
      
      
      // עדיפות 2: גיבוי – חיפוש לפי <p> עם הטקסט
      if (!produceBtn) {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (let btn of buttons) {
          const p = btn.querySelector('p');
          if (p) {
            const txt = (p.textContent || p.innerText || '').trim();
            if (txt.includes('הפקת הדוח') || txt.includes('הפקה')) {
              produceBtn = btn;
              break;
            }
          }
        }
      }

      if (produceBtn) {
        console.log("Menora: Found 'הפקת הדוח' button via Excel icon or text");
        produceBtn.scrollIntoView({ block: 'center' });
        produceBtn.removeAttribute('disabled');
        produceBtn.click();
      } else {
        console.warn("לא נמצא כפתור 'הפקת הדוח'");
      }

      // שלב 5: המתנה להודעת "תודה על בקשתך"
      await new Promise(r => setTimeout(r, 8000));
      const thankYouVisible = document.body.innerText.includes('תודה על בקשתך') ||
                             document.body.innerText.includes('הדוח נשלח להפקה') ||
                             document.querySelector('.MuiAlert-message');
      
      if (thankYouVisible) {
        console.log("[Menora] Thank you message detected – report requested");
      } else {
        console.warn("[Menora] No thank you message – check if report was requested");
      }

      return "DONE";
    })()
  `;

  try {
    const result = await page.evaluate(script);
    console.log(`[Menora] Produce process finished: ${result}`);
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error("[Menora] Produce evaluation failed:", e.message);
    } else {
      console.error("[Menora] Produce evaluation failed with unknown error:", e);
    }
  }

  // המתנה נוספת להפקה להתחיל
  await page.waitForTimeout(5000);
  await waitMenoraLoaderGone(page, 45000);
}


/**
 * מעבר לסטטוס והורדת הדוח החדש ביותר - גרסת String חסינה ל-EXE
 */
export async function menoraDownloadZip(page: Page): Promise<Download | null> {
  console.log("[Menora] Expanding 'Status' menu and hunting for download button...");

  // שלב 1: פתיחת התפריט
  const expandScript = " (function() { " +
    " const listButtons = Array.from(document.querySelectorAll('div[role=\"button\"], .MuiListItemButton-root')); " +
    " const statusBtn = listButtons.find(btn => { " +
    "   const txt = (btn.innerText || btn.textContent || '').trim(); " +
    "   return txt.includes('סטטוס דוחות') || txt.includes('דוחות שהופקו'); " +
    " }); " +
    " if (statusBtn) { " +
    "   const isExpanded = !!statusBtn.querySelector('svg[data-testid=\"ExpandLessIcon\"]'); " +
    "   if (isExpanded) return 'ALREADY_OPEN'; " +
    "   statusBtn.click(); " +
    "   return 'CLICKED_TO_OPEN'; " +
    " } " +
    " return 'NOT_FOUND'; " +
    " })() ";

  const expandRes = await page.evaluate(expandScript);
  console.log("[Menora] Status expansion: " + expandRes);

  await page.waitForTimeout(5000);

  // שלב 2: Polling - חיפוש כפתור הורדה לפי aria-label='הסתיים'
  for (let attempt = 0; attempt < 30; attempt++) {
    const actionScript = " (function() { " +
      " const allBtns = Array.from(document.querySelectorAll('div[role=\"button\"].MuiButtonBase-root')); " +
      " const downloadBtn = allBtns.find(btn => { " +
      "   const svg = btn.querySelector('svg[aria-label=\"הסתיים\"]'); " +
      "   return !!svg; " +
      " }); " +
      " if (!downloadBtn) return 'LIST_NOT_READY'; " +
      " downloadBtn.scrollIntoView({ block: 'center' }); " +
      " downloadBtn.click(); " +
      " return 'DOWNLOAD_CLICKED'; " +
      " })() ";

    const statusResult = await page.evaluate(actionScript);

    if (statusResult === "DOWNLOAD_CLICKED") {
      console.log("[Menora] Success! Download clicked on the newest report.");
      return await page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
    }

    console.log("[Menora] Attempt " + (attempt + 1) + ": " + statusResult);

    // רענון בכל ניסיון שלישי
    if (attempt % 3 === 0 && attempt > 0) {
      await page.evaluate(
        "const r = document.querySelector('svg[data-testid=\"RefreshIcon\"]'); if(r) r.parentElement.click();"
      ).catch(() => {});
    }

    await page.waitForTimeout(5000);
  }

  throw new Error("לא נמצא דוח במצב 'הסתיים' עם אייקון הורדה");
}