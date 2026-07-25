import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";
import path from "path";

function esc(v: string) {
  return String(v ?? "").replace(/'/g, "\\'");
}

/**
 * חישוב חודשיים אחורה בפורמט YYYY-MM (ברירת מחדל, אם לא נבחר חודש מפורש)
 */
function getTwoMonthsAgoPickerTitle(): string {
  // אותו חישוב בדיוק כמו באלטשולר - Date אמיתי, לא חשבון ידני
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * לוגין – ילין לפידות
 */
export async function yalinLogin(
  page: Page,
  idNumber: string,
  phoneNumber: string
) {
  console.log('[Yalin] idNumber value:', JSON.stringify(idNumber));
  console.log('[Yalin] phoneNumber value:', JSON.stringify(phoneNumber));
  const cdp = await page.context().newCDPSession(page);

  for (let i = 0; i < 20; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('input[name="personalId"]') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    console.log(`[Yalin] personalId check ${i+1}:`, check.result.value);
    if (check.result.value === "FOUND") break;
    await page.waitForTimeout(1000);
  }

  await page.waitForTimeout(500);

  const idResult = await cdp.send("Runtime.evaluate", {
    expression: `(function(val) {
      const el = document.querySelector('input[name="personalId"]');
      if (!el) return 'NOT_FOUND';
      el.focus();
      el.select();
      document.execCommand('insertText', false, val);
      return 'val:' + el.value;
    })('${esc(idNumber)}')`,
    returnByValue: true,
  });
  console.log('[Yalin] execCommand id result:', idResult.result.value);

  await page.waitForTimeout(400);

  const idAfter = await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('input[name="personalId"]')?.value || 'EMPTY'`,
    returnByValue: true,
  });
  console.log('[Yalin] idAfter:', idAfter.result.value);

  const phoneResult = await cdp.send("Runtime.evaluate", {
    expression: `(function(val) {
      const el = document.querySelector('input[name="mobileNumber"]');
      if (!el) return 'NOT_FOUND';
      el.focus();
      el.select();
      document.execCommand('insertText', false, val);
      return 'val:' + el.value;
    })('${esc(phoneNumber)}')`,
    returnByValue: true,
  });
  console.log('[Yalin] execCommand phone result:', phoneResult.result.value);

  await page.waitForTimeout(400);

  const phoneAfter = await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('input[name="mobileNumber"]')?.value || 'EMPTY'`,
    returnByValue: true,
  });
  console.log('[Yalin] phoneAfter:', phoneAfter.result.value);

  const finalCheck = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      id: document.querySelector('input[name="personalId"]')?.value || 'EMPTY',
      phone: document.querySelector('input[name="mobileNumber"]')?.value || 'EMPTY',
      cbChecked: document.querySelector('input[name="confirm"]')?.checked || false,
      btnExists: !!document.querySelector('button.continue-btn')
    })`,
    returnByValue: true,
  });
  console.log('[Yalin] Final state before submit:', finalCheck.result.value);

  await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const cb = document.querySelector('input[name="confirm"]');
      if (cb && !cb.checked) cb.click();
      setTimeout(() => {
        const btn = document.querySelector('button.continue-btn');
        if (btn) btn.click();
      }, 500);
    })()`,
    returnByValue: true,
  });

  await page.waitForTimeout(4000);
}

/**
 * OTP – ילין לפידות
 */
export async function yalinHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";

  const cdp = await page.context().newCDPSession(page);

  for (let i = 0; i < 20; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('input[name="code"]') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    if (check.result.value === "FOUND") break;
    await page.waitForTimeout(1000);
  }

  await setStatus(runId, {
    status: "otp_required",
    step: "ממתין לקוד אימות מילין לפידות",
    "otp.mode": "firestore",
    monthLabel,
  });

  const otp = await pollOtp(runId);
  if (!otp) throw new Error("OTP Timeout");

  const otpPos = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const el = document.querySelector('input[name="code"]');
      if (!el) return null;
      el.focus();
      const rect = el.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
    })()`,
    returnByValue: true,
  });

  const pos = JSON.parse(otpPos.result.value || 'null');
  if (!pos) throw new Error("OTP input position not found");

  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  await page.keyboard.type(otp, { delay: 150 });
  await page.waitForTimeout(500);

  await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const btn = document.querySelector('button.continue-btn');
      if (btn) btn.click();
      return btn ? 'CLICKED' : 'NOT_FOUND';
    })()`,
    returnByValue: true,
  });

  await page.waitForTimeout(4000);
  await clearOtp(runId).catch(() => {});
}

/**
 * בחירת חודש בשדה picker בודד (fromDate/toDate) - מבוסס Ant Design.
 * אומת ידנית מול הדף החי:
 * - פתיחת הפאנל דורשת רצף אירועי עכבר מלא (click פשוט על ה-input לא מספיק)
 * - עלולים להיות כמה פאנלים שיוריים ב-DOM בו-זמנית (מ-fromDate ומ-toDate) -
 *   חובה לסנן תמיד לאלמנט הגלוי כרגע (offsetParent !== null), לא ההתאמה
 *   הראשונה הסתמית
 * - בחירת התא עצמו (td[title]) כן מגיבה ל-click פשוט
 */
async function selectYalinPickerMonth(cdp: any, page: Page, fieldSelector: string, targetYm: string) {
  const [targetYear] = targetYm.split('-');

  // שלב 1: פתיחת הפאנל - רצף אירועי עכבר מלא
  await cdp.send("Runtime.evaluate", {
    expression: `(function(sel) {
      const el = document.querySelector(sel);
      if (!el) return 'INPUT_NOT_FOUND';
      const rect = el.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 };
      el.dispatchEvent(new MouseEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return 'OPENED';
    })(${JSON.stringify(fieldSelector)})`,
    returnByValue: true,
  });
  await page.waitForTimeout(500);

  // שלב 2: וידוא שנה נכונה - רק על הפאנל הגלוי כרגע
  for (let i = 0; i < 5; i++) {
    const yearCheck = await cdp.send("Runtime.evaluate", {
      expression: `(function() {
        const btn = Array.from(document.querySelectorAll('.ant-picker-year-btn')).find(el => el.offsetParent !== null);
        return btn ? btn.textContent.trim() : '';
      })()`,
      returnByValue: true,
    });
    if (yearCheck.result.value === targetYear) break;

    await cdp.send("Runtime.evaluate", {
      expression: `(function() {
        const btn = Array.from(document.querySelectorAll('.ant-picker-header-super-prev-btn')).find(el => el.offsetParent !== null);
        if (btn) btn.click();
      })()`,
      returnByValue: true,
    });
    await page.waitForTimeout(500);
  }

  // שלב 3: בחירת התא - רק הגלוי כרגע
  await cdp.send("Runtime.evaluate", {
    expression: `(function(title) {
      const cell = Array.from(document.querySelectorAll('td[title="' + title + '"]')).find(el => el.offsetParent !== null);
      if (cell) cell.click();
    })(${JSON.stringify(targetYm)})`,
    returnByValue: true,
  });
  await page.waitForTimeout(500);
}

/**
 * ניווט לדוח עמלות + הגדרת תאריך + ייצוא אקסל
 */
export async function yalinNavigateAndExport(
  page: Page,
  requestedReportMonth?: string
): Promise<import("playwright").Download | null> {
  const cdp = await page.context().newCDPSession(page);
  const targetYm = requestedReportMonth || getTwoMonthsAgoPickerTitle(); // "YYYY-MM"

  // שלב 1: לחץ על "צפיה בדוח עמלות" בתפריט
  await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const spans = Array.from(document.querySelectorAll('span.nav-link-text'));
      const target = spans.find(s => (s.textContent || '').includes('צפיה בדוח עמלות'));
      if (!target) return 'NOT_FOUND';
      const link = target.closest('a');
      if (link) link.click();
      else target.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  await page.waitForTimeout(3000);

  // שלב 2: בחירת חודש - חובה קודם "עד חודש עמלה" (toDate), ורק אחר כך
  // "מחודש עמלה" (fromDate) - זה סדר-התלות בפועל אצל ילין: אם בוחרים
  // fromDate קודם, החודש הרצוי לא פתוח לבחירה ב-toDate.
  await selectYalinPickerMonth(cdp, page, '#toDate', targetYm);
  await selectYalinPickerMonth(cdp, page, '#fromDate', targetYm);

  // שלב 3: לחץ "הצג"
  await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const btn = document.querySelector('button[type="submit"].data-filter__btn');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  await page.waitForTimeout(5000);

  // שלב 4: ייצא לאקסל
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      cdp.send("Runtime.evaluate", {
        expression: `(function() {
          const btn = document.querySelector('button.styled-btn.btn-excel');
          if (!btn) return 'NOT_FOUND';
          btn.click();
          return 'CLICKED';
        })()`,
        returnByValue: true,
      }),
    ]);
    return download;
  } catch (e: any) {
    return null;
  }
}