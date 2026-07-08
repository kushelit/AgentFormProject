import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";

function esc(v: string) {
  return String(v ?? "").replace(/'/g, "\\'");
}

/**
 * חישוב חודשיים אחורה בפורמט MM/YYYY
 */
function getTwoMonthsAgoStr(): string {
  const now = new Date();
  let month = now.getMonth() - 1; // 0-based, מינוס 2
  let year = now.getFullYear();
  if (month < 0) {
    month += 12;
    year--;
  }
  return `${String(month + 1).padStart(2, "0")}/${year}`;
}

/**
 * חישוב חודשיים אחורה בפורמט YYYY-MM (לבחירה ב-picker)
 */
function getTwoMonthsAgoPickerTitle(): string {
  const now = new Date();
  let month = now.getMonth() - 1;
  let year = now.getFullYear();
  if (month < 0) {
    month += 12;
    year--;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}`;
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

  // הזרקת personalId
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

  // הזרקת mobileNumber
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

  // בדוק מצב לפני שליחה
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

  // checkbox ולחיצה
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

  // המתנה לשדה OTP
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

  // מצא מיקום שדה OTP ולחץ עליו
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

  // לחץ המשך
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
 * ניווט לדוח עמלות + הגדרת תאריך + ייצוא אקסל
 */
export async function yalinNavigateAndExport(
  page: Page
): Promise<import("playwright").Download | null> {
  const cdp = await page.context().newCDPSession(page);
  const targetStr = getTwoMonthsAgoStr(); // "03/2026"
  const targetTitle = getTwoMonthsAgoPickerTitle(); // "2026-03"

  // שלב 1: לחץ על "צפיה בדוח עמלות" בתפריט
  const navResult = await cdp.send("Runtime.evaluate", {
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

  // שלב 2: בדוק אם fromDate כבר על החודש הנכון
  const currentVal = await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('input#fromDate')?.value || ''`,
    returnByValue: true,
  });

  if (currentVal.result.value !== targetStr) {
    // פתח picker ובחר חודש
    const calendarClicked = await cdp.send("Runtime.evaluate", {
      expression: `(function() {
        const cal = document.querySelector('span[role="img"][aria-label="calendar"]');
        if (!cal) return 'NOT_FOUND';
        cal.click();
        return 'CLICKED';
      })()`,
      returnByValue: true,
    });

    await page.waitForTimeout(1500);

    // בדוק שנה — אם לא נכונה לחץ חץ אחורה
    const targetYear = targetTitle.split("-")[0];
    for (let i = 0; i < 3; i++) {
      const yearCheck = await cdp.send("Runtime.evaluate", {
        expression: `(function() {
          const header = document.querySelector('.ant-picker-year-btn');
          return header ? header.textContent.trim() : '';
        })()`,
        returnByValue: true,
      });

      if (yearCheck.result.value === targetYear) break;

      await cdp.send("Runtime.evaluate", {
        expression: `(function() {
          const btn = document.querySelector('.ant-picker-header-super-prev-btn');
          if (btn) btn.click();
        })()`,
        returnByValue: true,
      });
      await page.waitForTimeout(500);
    }

    // בחר חודש לפי title
    await cdp.send("Runtime.evaluate", {
      expression: `(function(title) {
        const cell = document.querySelector('td[title="' + title + '"]');
        if (!cell) return 'NOT_FOUND';
        cell.click();
        return 'CLICKED';
      })('${targetTitle}')`,
      returnByValue: true,
    });

    await page.waitForTimeout(1000);
  }

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