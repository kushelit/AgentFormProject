import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";
import path from "path";

function getPrevMonthHebrew(): string {
  const hebrewMonths = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני',
                        'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return hebrewMonths[prevMonth.getMonth()];
}

export async function altshulerLogin(page: Page, companyId: string, idNumber: string) {
  console.log("[Altshuler] Starting login...");
  const cdp = await page.context().newCDPSession(page);

  // ✅ שלב 1: וודא שטאב ח.פ active
  await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const tab = document.querySelector('.text-left');
      if (!tab) return 'TAB_NOT_FOUND';
      if (!tab.classList.contains('active')) {
        tab.click();
        return 'CLICKED_TAB';
      }
      return 'ALREADY_ACTIVE';
    })()`,
    returnByValue: true,
  });
  await page.waitForTimeout(1000);

  // ✅ שלב 2: מלא 9 ספרות ח.פ - תיבות נפרדות
  console.log("[Altshuler] Filling company ID...");
  await fillDigitBoxes(page, cdp, companyId, 0); // מתחיל מ-index 0

  await page.waitForTimeout(500);

  // ✅ שלב 3: מלא 9 ספרות ת"ז - תיבות נפרדות
  console.log("[Altshuler] Filling ID number...");
  await fillDigitBoxes(page, cdp, idNumber, 9); // מתחיל מ-index 9 (אחרי 9 של ח.פ)

  await page.waitForTimeout(500);

  // ✅ שלב 4: לחץ "שלחו לי קוד זיהוי"
  const btnResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const btn = document.querySelector('button.login-new-button-component');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED: ' + btn.textContent?.trim();
    })()`,
    returnByValue: true,
  });
  console.log("[Altshuler] Send OTP btn:", btnResult.result.value);
}

async function fillDigitBoxes(page: any, cdp: any, value: string, startIndex: number) {
  const digits = value.replace(/\D/g, ''); // רק ספרות
  
  for (let i = 0; i < digits.length; i++) {
    const digit = digits[i];
    const boxIndex = startIndex + i;
    
    const result = await cdp.send("Runtime.evaluate", {
      expression: `(function(idx, val) {
        const boxes = Array.from(document.querySelectorAll('input.login-new-input-field'));
        const box = boxes[idx];
        if (!box) return 'BOX_NOT_FOUND_' + idx;
        box.focus();
        box.value = val;
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.dispatchEvent(new Event('change', { bubbles: true }));
        box.dispatchEvent(new Event('blur', { bubbles: true }));
        return 'OK';
      })(${boxIndex}, '${digit}')`,
      returnByValue: true,
    });
    
    if (result.result.value !== 'OK') {
      console.log(`[Altshuler] Box ${boxIndex} fill issue:`, result.result.value);
    }
    await page.waitForTimeout(100);
  }
}

export async function altshulerHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";
  const cdp = await page.context().newCDPSession(page);

  console.log("[Altshuler] Waiting for OTP screen...");

  // המתן לשדות ה-OTP (6 ספרות)
  for (let i = 0; i < 30; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `(function() {
        const boxes = Array.from(document.querySelectorAll('input.login-new-input-field'));
        // בדף ה-OTP יש 6 תיבות בלבד (לא 18 כמו בלוגין)
        return boxes.length === 6 ? 'FOUND' : 'NOT_FOUND_' + boxes.length;
      })()`,
      returnByValue: true,
    });
    console.log(`[Altshuler] OTP check ${i + 1}:`, check.result.value);
    if (check.result.value === 'FOUND') break;
    await page.waitForTimeout(1000);
  }

  await setStatus(runId, {
    status: "otp_required",
    step: "ממתין לקוד אימות מאלטשולר",
    "otp.mode": "firestore",
    monthLabel,
  });

  const otp = await pollOtp(runId);
  if (!otp) throw new Error("קוד ה-OTP לא התקבל");
  console.log("[Altshuler] OTP received:", otp);

  // הזרקה לכל תיבה בנפרד
  await fillDigitBoxes(page, cdp, otp, 0);
  await page.waitForTimeout(500);

  // לחץ "כניסה לאזור האישי"
  // לחץ "כניסה לאזור האישי"
const btnResult = await cdp.send("Runtime.evaluate", {
  expression: `(function() {
    // נסה קלאס ספציפי של דף OTP
    const btn = document.querySelector('button.verify-otp-component-submit-button') 
              || document.querySelector('button.login-new-button-component');
    if (!btn) return 'NOT_FOUND';
    btn.click();
    return 'CLICKED: ' + btn.textContent?.trim();
  })()`,
  returnByValue: true,
});
  console.log("[Altshuler] Login btn:", btnResult.result.value);

  await page.waitForTimeout(3000);

// בדוק שאנחנו בדף הבית ולא עדיין ב-login
for (let i = 0; i < 15; i++) {
  const check = await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('.nav-items, nav[role="navigation"]') ? 'LOGGED_IN' : 'WAITING'`,
    returnByValue: true,
  });
  console.log(`[Altshuler] Login verify ${i + 1}:`, check.result.value);
  if (check.result.value === 'LOGGED_IN') break;
  await page.waitForTimeout(1000);
}

await clearOtp(runId).catch(() => {});
}

export async function altshulerNavigateAndExport(
  page: Page,
  absDir: string
): Promise<{ localPath: string; filename: string }[]> {
  const results: { localPath: string; filename: string }[] = [];
  const cdp = await page.context().newCDPSession(page);
  const targetMonth = getPrevMonthHebrew();
  console.log(`[Altshuler] Target month: ${targetMonth}`);

  // ✅ שלב 1: hover על "עמלות" בתפריט ראשי
  console.log("[Altshuler] Hovering over עמלות menu...");
  const hoverResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const navItems = Array.from(document.querySelectorAll('.nav-item.has-submenu'));
      const target = navItems.find(el => (el.textContent || '').trim().includes('עמלות'));
      if (!target) return 'NOT_FOUND';
      target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return 'HOVERED';
    })()`,
    returnByValue: true,
  });
  console.log("[Altshuler] Hover result:", hoverResult.result.value);
  await page.waitForTimeout(1000);

  // ✅ שלב 2: לחץ "עמלות נפרעים גמל" בתפריט משני
  console.log("[Altshuler] Clicking עמלות נפרעים גמל...");
  const subMenuResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const links = Array.from(document.querySelectorAll('a[role="link"], a.nav-item'));
      const target = links.find(a => (a.textContent || '').trim().includes('עמלות נפרעים') && 
                                     (a.textContent || '').trim().includes('גמל'));
      if (!target) {
        // נסה לפי aria-label
        const byAria = document.querySelector('a[aria-label*="גמל"][aria-label*="עמלות"]');
        if (byAria) { byAria.click(); return 'CLICKED_ARIA'; }
        return 'NOT_FOUND: ' + links.map(a => a.textContent?.trim()).join(' | ');
      }
      target.click();
      return 'CLICKED: ' + target.textContent?.trim();
    })()`,
    returnByValue: true,
  });
  console.log("[Altshuler] Submenu result:", subMenuResult.result.value);
  await page.waitForTimeout(3000);

  // ✅ שלב 3: לחץ על טאב "פירוט עמלות סוכנים לפי קופה"
  console.log("[Altshuler] Clicking tab פירוט עמלות סוכנים לפי קופה...");
  const tabResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const tabs = Array.from(document.querySelectorAll('[role="tab"], .mdc-tab'));
      const target = tabs.find(t => (t.textContent || '').trim().includes('פירוט עמלות סוכנים לפי קופה'));
      if (!target) return 'NOT_FOUND: ' + tabs.map(t => t.textContent?.trim()).join(' | ');
      target.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  console.log("[Altshuler] Tab result:", tabResult.result.value);
  await page.waitForTimeout(2000);

  // ✅ שלב 4: פתח dropdown חודש ובחר
  console.log(`[Altshuler] Selecting month: ${targetMonth}`);
  const selectPos = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      // מחפש mat-select של חודש
      const selects = Array.from(document.querySelectorAll('mat-select'));
      const monthSelect = selects.find(s => {
        const val = s.querySelector('.mat-mdc-select-value')?.textContent || '';
        const label = s.closest('mat-form-field')?.textContent || '';
        return label.includes('חודש') || val.includes('ינואר') || val.includes('פברואר');
      }) || selects[0]; // fallback לראשון
      if (!monthSelect) return null;
      const rect = monthSelect.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
    })()`,
    returnByValue: true,
  });

  const pos = JSON.parse(selectPos.result.value || 'null');
  if (!pos) throw new Error("Month select not found");

  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(1000);

  // בחר את החודש הנכון
  const monthResult = await cdp.send("Runtime.evaluate", {
    expression: `(function(month) {
      const options = Array.from(document.querySelectorAll('mat-option'));
      const target = options.find(o => (o.textContent || '').trim() === month);
      if (!target) return 'NOT_FOUND: ' + options.map(o => o.textContent?.trim()).join(' | ');
      target.click();
      return 'CLICKED: ' + target.textContent?.trim();
    })('${targetMonth}')`,
    returnByValue: true,
  });
  console.log("[Altshuler] Month result:", monthResult.result.value);
  await page.waitForTimeout(500);

  // ✅ שלב 5: לחץ "הצג"
  console.log("[Altshuler] Clicking הצג...");
  const showResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => (b.textContent || '').trim() === 'הצג');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  console.log("[Altshuler] Show result:", showResult.result.value);
  await page.waitForTimeout(5000);

  // ✅ שלב 6: לחץ על אייקון אקסל להורדה
 // ✅ שלב 6: לחץ על אייקון אקסל להורדה
console.log("[Altshuler] Clicking Excel export...");
try {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    cdp.send("Runtime.evaluate", {
      expression: `(function() {
        // לפי img alt או src
        const img = document.querySelector('img[alt="יצא לאקסל"], img[src*="EXEL"], img[src*="excel"]');
        if (!img) return 'IMG_NOT_FOUND';
        
        // נסה div[role="link"] שמכיל את ה-img
        const divLink = img.closest('div[role="link"]');
        if (divLink) { divLink.click(); return 'CLICKED_DIV'; }
        
        // נסה a רגיל
        const aLink = img.closest('a');
        if (aLink) { aLink.click(); return 'CLICKED_A'; }
        
        // לחץ ישירות על ה-img
        img.click();
        return 'CLICKED_IMG';
      })()`,
      returnByValue: true,
    }),
  ]);

    const filename = download.suggestedFilename();
    const localPath = path.join(absDir, `${Date.now()}_${filename}`);
    await download.saveAs(localPath);
    console.log("[Altshuler] Saved:", localPath);
    results.push({ localPath, filename });

  } catch (e: any) {
    console.log("[Altshuler] Export failed:", e?.message);
  }

  return results;
}