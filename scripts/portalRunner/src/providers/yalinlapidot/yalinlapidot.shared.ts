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
  page: Page,
  requestedReportMonth?: string
): Promise<import("playwright").Download | null> {
  const cdp = await page.context().newCDPSession(page);

  // 🔧 requestedReportMonth (YYYY-MM) → שני הפורמטים שהפורטל צריך
  let targetStr: string;
  let targetTitle: string;

  if (requestedReportMonth) {
    const [y, m] = requestedReportMonth.split('-');
    targetTitle = `${y}-${m}`;   // "2026-06"
    targetStr = `${m}/${y}`;     // "06/2026"
  } else {
    targetStr = getTwoMonthsAgoStr();           // "05/2026"
    targetTitle = getTwoMonthsAgoPickerTitle(); // "2026-05"
  }

  console.log(`[Yalin] targetStr: "${targetStr}" | targetTitle: "${targetTitle}"`); // 🔧 debug

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
  console.log('[Yalin] nav result:', navResult.result.value); // 🔧 debug

  await page.waitForTimeout(3000);

  // ─── helper: פתח picker לשדה מסוים ובחר חודש לפי title ──────────────
async function pickMonth(inputId: string, title: string): Promise<void> {
    const curVal = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('input#${inputId}')?.value || ''`,
      returnByValue: true,
    });

    const [y, m] = title.split('-');
    const expectedStr = `${m}/${y}`;

    console.log(`[Yalin] ${inputId} — current: "${curVal.result.value}" | expected: "${expectedStr}"`);

    if (curVal.result.value === expectedStr) {
      console.log(`[Yalin] ${inputId} — already correct, skipping`);
      return;
    }

    // לחץ ישירות על ה-input כדי לפתוח את ה-picker
    const clickResult = await cdp.send("Runtime.evaluate", {
      expression: `(function(id) {
        const input = document.querySelector('input#' + id);
        if (!input) return 'INPUT_NOT_FOUND';
        input.click();
        return 'CLICKED';
      })('${inputId}')`,
      returnByValue: true,
    });
    console.log(`[Yalin] ${inputId} — input click: "${clickResult.result?.value}"`);

    await page.waitForTimeout(1500);

    // בחר את התא לפי title (YYYY-MM)
    const cellResult = await cdp.send("Runtime.evaluate", {
      expression: `(function(t) {
        const cell = document.querySelector('td[title="' + t + '"]');
        if (!cell || cell.classList.contains('ant-picker-cell-disabled')) return 'NOT_FOUND_OR_DISABLED';
        const inner = cell.querySelector('.ant-picker-cell-inner');
        if (inner) inner.click();
        else cell.click();
        return 'CLICKED';
      })('${title}')`,
      returnByValue: true,
    });
    console.log(`[Yalin] ${inputId} — cell click "${title}": "${cellResult.result?.value}"`);

    await page.waitForTimeout(1000);
  }

  // שלב 2: הגדר toDate קודם, אחר כך fromDate (כמו שהפורטל דורש)
  await pickMonth('toDate', targetTitle);
  await page.waitForTimeout(500);
  await pickMonth('fromDate', targetTitle);
  await page.waitForTimeout(500);

  // שלב 3: לחץ "הצג"
  const showResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const btn = document.querySelector('button[type="submit"].data-filter__btn');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  console.log('[Yalin] show button:', showResult.result?.value); // 🔧 debug

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