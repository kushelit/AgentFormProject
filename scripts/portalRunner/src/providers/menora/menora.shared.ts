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
await page.waitForFunction(loaderScript, undefined, { timeout: timeoutMs }).catch(() => {});  } catch (e) {}
}

async function menoraWaitForLoginResult(page: Page, timeoutMs = 15000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const errorText = await menoraGetLoginErrorText(page);
    if (errorText) return errorText;

    const otpFieldReady = await page.evaluate(`
      !!document.querySelector('input[id^="otp-input"], input[name*="otp"], .otp-field input')
    `).catch(() => false);
    if (otpFieldReady) return null;

    await page.waitForTimeout(500).catch(() => {});
  }
  return null;
}

async function menoraGetLoginErrorText(page: Page): Promise<string | null> {
  return await page.evaluate(`
    (function() {
      // סוג 1: מודאל כישלון-לוגין - מזוהה לפי data-mnr-bo הייחודי, לא טקסט חופשי
      const modalTitle = document.querySelector('[data-mnr-bo="service-doc-sale-modal-title"]');
      if (modalTitle && modalTitle.offsetParent !== null) {
        const txt = modalTitle.getAttribute('aria-label') || (modalTitle.innerText || modalTitle.textContent || '').trim();
        if (txt) return txt;
      }

      const helperText = document.querySelector('#username-helper-text, .MuiFormHelperText-root.Mui-error');
      if (helperText && helperText.offsetParent !== null) {
        const txt = (helperText.innerText || helperText.textContent || '').trim();
        if (txt) return txt;
      }
return null;
    })()
  `).catch(() => null) as string | null;
}


/**
 * לוגין מנורה: הזרקה עקשנית שמוודאת שהערך לא נמחק ע"י האתר
 */
export async function menoraLogin(page: Page, username: string, phoneNumber: string) {
  // console.log("[Menora] Injecting credentials with Persistence Check...");

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

  // בדיקה אמיתית: ממתינים עד 15 שניות עד שמופיע **או** מודאל-שגיאה **או**
  // שדה ה-OTP (סימן הצלחה אמיתי) - לא בדיקה בודדת אחרי המתנה קבועה, כי
  // המודאל יכול להתעכב ולהופיע אחרי חלון-הבדיקה הקבוע הישן.
  const errorText = await menoraWaitForLoginResult(page, 15000);
  if (errorText) {
    throw new Error(`מנורה: פרטי ההתחברות שגויים - הפורטל הציג "${errorText}"`);
  }
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

  // console.log(`[Menora] Code received: ${otpCode}, injecting...`);

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
  // console.log(`[Menora] OTP Injection Result: ${res}`);

  // המתנה לראות אם האתר עבר דף (Auto-Submit)
  try {
    // אנחנו מחכים שהלוגו של מנורה בפנים יופיע או שה-URL ישתנה
    await page.waitForFunction(() => {
      return !!document.querySelector('a.logo[href*="agents-site"], .user-profile, [class*="dashboard"]');
    }, undefined, { timeout: 15000 });
    // console.log("[Menora] OTP Auto-Submit successful ✅");
  } catch (e) {
    // console.log("[Menora] OTP did not auto-submit, checking if button is needed...");
    // גיבוי: אם יש כפתור אישור שבכל זאת הופיע, נלחץ עליו
    await page.evaluate(`
      const btn = document.querySelector('button[type="submit"], .approve-btn, button:has-text("כניסה")');
      if (btn) btn.click();
    `).catch(() => {});
  }

  await clearOtp(runId).catch(() => {});
}



/**
 * ניווט לעמלות ולחיצה על לשונית דוחות
 */
export async function menoraNavigateToCommissions(page: Page) {
  const targetUrl = "https://menoranet.menora.co.il/agent-financial-info/commissions";
  
  const t0 = Date.now();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});

 await page.waitForFunction(() => {
    return !!document.querySelector('img[alt="calendar"], img[class*="css-1aepfpb"]');
  }, { timeout: 15000 }).catch(() => {});

  await waitMenoraLoaderGone(page, 10000);
  // console.log("[Menora] Attempting to click 'דוחות' tab...");
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
  // console.log("[Menora] Tab activation result: " + res);

  if (res === "NOT_FOUND") {
    throw new Error("לא נמצאה לשונית 'דוחות' בדף העמלות");
  }

  // המתנה אמיתית לשדות התאריך (אייקון הלוח-שנה), במקום 3 שניות קבועות -
await page.waitForFunction(() => {
    return !!document.querySelector('img[alt="calendar"], img[class*="css-1aepfpb"]');
  }, undefined, { timeout: 15000 }).catch(() => {});

  await waitMenoraLoaderGone(page, 10000);
}

/**
 * בחירת חברה/ישות לפי "מספר הנהלת חשבונות" (בית סוכן) - אלטרנטיבה לבחירת
 * "סוכנים" הרגילה. אומת מול הדף החי: השדה #test-searchAgent הוא
 * MUI Autocomplete, פתיחה דורשת רצף אירועי עכבר מלא (לא click פשוט);
 * הרשימה כולה קיימת ב-DOM בבת אחת (לא וירטואלית) אז חיפוש טקסטואלי ישיר
 * מספיק, אין צורך בגלילה.
 */
async function menoraSelectCompanyByAccountingNumber(page: Page, accountingNumber: string): Promise<string> {
  await page.evaluate(`
    (function() {
      const el = document.querySelector('#test-searchAgent');
      if (!el) return 'INPUT_NOT_FOUND';
      const rect = el.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 };
      el.dispatchEvent(new MouseEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return 'CLICKED';
    })()
  `);
  await page.waitForTimeout(800);

  const result = await page.evaluate(`
    (function(num) {
      const li = Array.from(document.querySelectorAll('.MuiAutocomplete-popper li, .MuiAutocomplete-listbox li, ul.MuiAutocomplete-listbox > li'))
        .find(el => (el.textContent || '').includes(num));
      if (!li) return 'NOT_FOUND';
      const checkbox = li.querySelector('input[type="checkbox"]') || li.querySelector('.MuiCheckbox-root');
      if (!checkbox) return 'CHECKBOX_NOT_FOUND';
      checkbox.click();
      return 'CLICKED';
    })(${JSON.stringify(accountingNumber)})
  `);

  await page.waitForTimeout(500);

  // סגירת הרשימה - אותו pattern שכבר קיים ב-menoraProduceReport
  await page.evaluate(`
    (function() {
      document.body.click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
    })()
  `);
  await page.waitForTimeout(1000);

  return String(result);
}


/**
 * בחירת סוכנים והפקת דוח - גרסה משולבת וחסינה
 */
export async function menoraProduceReport(page: Page, accountingNumber?: string) {
  // console.log("[Menora] Producing report...");

  if (accountingNumber) {
    // console.log("[Menora] Selecting company by accounting number:", accountingNumber);
    const selectResult = await menoraSelectCompanyByAccountingNumber(page, accountingNumber);
    // console.log("[Menora] Accounting number select result:", selectResult);
  } else {
    // הזרימה הרגילה - פתיחת "בחירת ישות" ובחירת "סוכנים" (ללא שינוי מהמקור)
    const openAndSelectAgentsScript = `
      (async function() {
        const expandIcon = document.querySelector('svg[data-testid="ExpandMoreIcon"]');
        if (expandIcon && expandIcon.parentElement) {
          expandIcon.parentElement.click();
        } else {
          const trigger = document.querySelector('[role="combobox"], [aria-haspopup="listbox"]');
          if (trigger) trigger.click();
        }
        await new Promise(r => setTimeout(r, 1500));

        const allSpans = Array.from(document.querySelectorAll('span, p, label'));
        const agentsSpan = allSpans.find(s => (s.innerText || s.textContent || "").trim() === 'סוכנים');

        if (agentsSpan) {
          const row = agentsSpan.closest('li, [role="option"], label, .MuiMenuItem-root');
          if (row) {
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) {
              if (!checkbox.checked) checkbox.click();
            } else {
              row.click();
            }
          }
        }

        const backdrop = document.querySelector('.MuiBackdrop-root, .MuiModal-backdrop');
        if (backdrop) backdrop.click();
        document.body.click();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 2000));
        return 'DONE';
      })()
    `;
    await page.evaluate(openAndSelectAgentsScript);
  }

  // שלב 4: לחיצה על "הפקת הדוח"
  const script = `
    (async function() {            // שלב 4: לחיצה על "הפקת הדוח" – חיפוש לפי אייקון Excel + טקסט
      let produceBtn = null;
      
      // עדיפות 1: חיפוש button שמכיל img עם alt="excel" או src עם excel
const excelImgs = document.querySelectorAll('img[alt="excel"], img[src*="excel"], img[src*="excel.svg"]');
      for (let img of excelImgs) {
        const parentBtn = img.closest('button');
        if (parentBtn) {
          // אם מצאנו button עם אייקון Excel – נלחץ עליו גם אם הטקסט לא מושלם
          produceBtn = parentBtn;
          // console.log("Menora: Found button via Excel icon – no text check needed");
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
        // console.log("Menora: Found 'הפקת הדוח' button via Excel icon or text");
        produceBtn.scrollIntoView({ block: 'center' });
        produceBtn.removeAttribute('disabled');
        produceBtn.click();
      } else {
        // console.warn("לא נמצא כפתור 'הפקת הדוח'");
      }

      // שלב 5: המתנה להודעת "תודה על בקשתך"
      await new Promise(r => setTimeout(r, 8000));
      const thankYouVisible = document.body.innerText.includes('תודה על בקשתך') ||
                             document.body.innerText.includes('הדוח נשלח להפקה') ||
                             document.querySelector('.MuiAlert-message');
      
      if (thankYouVisible) {
        // console.log("[Menora] Thank you message detected – report requested");
      } else {
        // console.warn("[Menora] No thank you message – check if report was requested");
      }

      return "DONE";
    })()
  `;

  try {
    const result = await page.evaluate(script);
    // console.log(`[Menora] Produce process finished: ${result}`);
  } catch (e: unknown) {
    if (e instanceof Error) {
      // console.error("[Menora] Produce evaluation failed:", e.message);
    } else {
      // console.error("[Menora] Produce evaluation failed with unknown error:", e);
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
  // console.log("[Menora] Expanding 'Status' menu and hunting for download button...");

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
  // console.log("[Menora] Status expansion: " + expandRes);

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
      // console.log("[Menora] Success! Download clicked on the newest report.");
      return await page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
    }

    // console.log("[Menora] Attempt " + (attempt + 1) + ": " + statusResult);

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


/**
 * הזנת תאריך דרך DatePicker של Menora - גרסה בטוחה ל-EXE
 */
export async function menoraSetReportDate(page: Page, monthYear: string) {
  const parts = monthYear.split(/[.\/]/).map(s => s.trim());
  const monthNum = parseInt(parts[0], 10);
  const year = parts[1];

  const hebrewMonths = [
    "ינו'", "פבר'", "מרץ", "אפר'", "מאי", "יוני",
    "יולי", "אוג'", "ספטי'", "אוק'", "נוב'", "דצמ'"
  ];
  const monthName = hebrewMonths[monthNum - 1];

  // console.log(`[Menora] Setting date: ${monthName} ${year}`);

  const safeMonth = JSON.stringify(monthName);
  const safeYear = JSON.stringify(year);

  for (let boxIndex = 0; boxIndex < 2; boxIndex++) {
    // console.log(`[Menora] Processing date box ${boxIndex + 1}...`);

    const script = `
      (async function() {
        const mName = ${safeMonth};
        const y = ${safeYear};
        const idx = ${boxIndex};
        
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        
        // 1. איתור הקופסה
        const boxes = Array.from(document.querySelectorAll('.MuiBox-root.css-vgmry7'));
        if (boxes.length <= idx) return 'BOX_NOT_FOUND';
        const box = boxes[idx];

        // 2. לחיצה על האייקון של ה-Calendar (לפי image_0eacc1)
        const calendarImg = box.querySelector('img[alt="calendar"], img[class*="css-1aepfpb"]');
        if (!calendarImg) return 'CALENDAR_IMAGE_NOT_FOUND';
        
        const trigger = calendarImg.closest('button') || calendarImg;
        trigger.click();
        await wait(2000);

        // 3. בחירת שנה - פתיחת רשימת שנים במידת הצורך
        const picker = document.querySelector('.MuiPickersPopper-root, [role="dialog"]');
        if (!picker) return 'PICKER_NOT_OPEN';

        const headerLabel = picker.querySelector('button[class*="MuiPickersFadeTransitionGroup-root"], .MuiPickersCalendarHeader-label');
        if (headerLabel && !document.querySelector('.PrivatePickersYear-yearButton')) {
           headerLabel.click();
           await wait(1000);
        }

        const yearBtn = Array.from(document.querySelectorAll('.PrivatePickersYear-yearButton, .MuiPickersYear-yearButton'))
          .find(el => el.textContent.trim() === y);
        
        if (yearBtn) {
          yearBtn.click();
          await wait(1500);
        }

        // 4. בחירת חודש - לוגיקה חסינת גרשים ( image_0ec2aa )
        // ננקה את כל סוגי הגרשים (רגיל וגרש עברי) מהשם שאנחנו מחפשים
        const targetBase = mName.replace(/['׳]/g, '').trim(); 
        
        const monthButtons = Array.from(document.querySelectorAll('.PrivatePickersMonth-root, .MuiPickersMonth-root, button[class*="MuiPickersMonth"]'));
        
        const targetMonthBtn = monthButtons.find(btn => {
          const txt = (btn.textContent || '').trim();
          // ננקה גרשים גם מהטקסט של הכפתור באתר
          const txtBase = txt.replace(/['׳]/g, '').trim();
          
          // השוואה של אותיות הבסיס בלבד
          return txtBase === targetBase || txt.includes(targetBase);
        });

        if (targetMonthBtn) {
          targetMonthBtn.click();
          await wait(1000);
          return 'SUCCESS';
        }

        // לצורך דיבאג בלוג אם נכשל
        const found = monthButtons.map(b => b.textContent.trim()).join(', ');
        return 'MONTH_NOT_FOUND: ' + mName + ' | OPTIONS_ON_PAGE: ' + found;
      })()
    `;

    const result = await page.evaluate(script);
    // console.log(`[Menora] Box ${boxIndex + 1} result: ${result}`);
    
    await page.waitForTimeout(1000);
  }
}