import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";
import path from "path";

export async function analystLogin(page: Page, idNumber: string, phoneNumber: string) {
  // console.log("[Analyst] Filling login form...");

  const cdp = await page.context().newCDPSession(page);

  // המתנה לשדות
  for (let i = 0; i < 20; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('#mat-input-0') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    if (check.result.value === 'FOUND') break;
    await page.waitForTimeout(1000);
  }

  const fillResult = await cdp.send("Runtime.evaluate", {
    expression: `(function(id, phone) {
      function fill(selector, val) {
        const el = document.querySelector(selector);
        if (!el) return false;
        el.focus();
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      }

      const idOk = fill('#mat-input-0', id);
      const phoneOk = fill('#mat-input-1', phone);

      if (!idOk) return 'ID_NOT_FOUND';
      if (!phoneOk) return 'PHONE_NOT_FOUND';

      setTimeout(() => {
        const btn = document.querySelector('button[type="submit"]');
        if (btn) btn.click();
      }, 500);

      return 'SUCCESS';
    })('${idNumber}', '${phoneNumber}')`,
    returnByValue: true,
  });

  // console.log("[Analyst] Login fill result:", fillResult.result.value);
  if (!fillResult.result.value?.toString().startsWith('SUCCESS')) {
    throw new Error(`Login failed: ${fillResult.result.value}`);
  }
}

export async function analystHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";

  // console.log("[Analyst] Waiting for OTP screen...");
  const cdp = await page.context().newCDPSession(page);

  // המתן לשדה OTP הנסתר
  for (let i = 0; i < 30; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('.hidden-otp-input') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    // console.log(`[Analyst] OTP screen check ${i + 1}:`, check.result.value);
    if (check.result.value === 'FOUND') break;
    await page.waitForTimeout(1000);
  }

  await setStatus(runId, {
    status: "otp_required",
    step: "ממתין לקוד אימות מאנליסט",
    "otp.mode": "firestore",
    monthLabel,
  });

  const otp = await pollOtp(runId);
  if (!otp) throw new Error("קוד ה-OTP לא התקבל");
  // console.log("[Analyst] OTP received:", otp);

  // הזרקה לשדה הנסתר + לכל תיבה בנפרד
  const otpResult = await cdp.send("Runtime.evaluate", {
    expression: `(function(code) {
      // 1. הזרקה לשדה הנסתר
      const hidden = document.querySelector('.hidden-otp-input');
      if (hidden) {
        hidden.focus();
        hidden.value = code;
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 2. הזרקה לכל תיבה ויזואלית בנפרד
      const boxes = ['mat-input-2','mat-input-3','mat-input-4','mat-input-5','mat-input-6','mat-input-7'];
      boxes.forEach((id, idx) => {
        const el = document.querySelector('#' + id);
        if (!el || !code[idx]) return;
        el.focus();
        el.value = code[idx];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      });

      // 3. לחץ כניסה
      setTimeout(() => {
        const btn = document.querySelector('button.btn-submit');
        if (btn) btn.click();
      }, 800);

      return 'SUCCESS';
    })('${otp}')`,
    returnByValue: true,
  });

  // console.log("[Analyst] OTP inject result:", otpResult.result.value);
  await page.waitForTimeout(5000);
  await clearOtp(runId).catch(() => {});
}


export async function analystNavigateAndExport(
  page: Page,
  absDir: string
): Promise<{ localPath: string; filename: string; templateId: string }[]> {
  const results: { localPath: string; filename: string; templateId: string }[] = [];
  const cdp = await page.context().newCDPSession(page);

  // ✅ שלב 1: סגור popup אם קיים
  // console.log("[Analyst] Waiting for popup if exists...");
  await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const btn = document.querySelector('button[aria-label="סגירה"][type="submit"]');
          if (btn) {
            clearInterval(interval);
            btn.click();
            resolve('CLOSED');
          }
          if (attempts >= 10) {
            clearInterval(interval);
            resolve('NO_POPUP');
          }
        }, 500);
      });
    })()`,
    returnByValue: true,
  });

  // ✅ שלב 2: לחץ "הפקת דוחות" בסרגל
  // console.log("[Analyst] Clicking reports nav link...");
  const navResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const link = document.querySelector('a[href="/reports"]');
      if (!link) return 'NOT_FOUND';
      link.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  // console.log("[Analyst] Nav result:", navResult.result.value);
  await page.waitForTimeout(3000);

  // ✅ שלב 3: בחר סוג דוח
  const REPORTS = [
    { name: "עמלות סוכנים", templateId: "analyst_insurance" },
    { name: "גיוסים", templateId: "analyst_volume" },
  ];

  for (const rep of REPORTS) {
    // שלב 3: פתח dropdown
    const selectPos = await cdp.send("Runtime.evaluate", {
      expression: `(function() {
        const el = document.querySelector('mat-select[aria-label="בחירת סוג דוח"], mat-select[aria-label="בחירות סוג דות"], #mat-select-1, #mat-select-3');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
      })()`,
      returnByValue: true,
    });

    const pos = JSON.parse(selectPos.result.value || 'null');
    if (!pos) throw new Error("Report type select not found");

    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(1000);

    // שלב 4: בחר דוח
    await cdp.send("Runtime.evaluate", {
      expression: `(function(name) {
        const options = Array.from(document.querySelectorAll('mat-option'));
        const target = options.find(o => (o.textContent || '').trim().includes(name));
        if (target) target.click();
      })('${rep.name}')`,
      returnByValue: true,
    });
    await page.waitForTimeout(1000);

    // שלב 5: הפק דוח
    try {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 30000 }),
        cdp.send("Runtime.evaluate", {
          expression: `(function() {
            const btn = document.querySelector('button[aria-label="הפק דות"]');
            if (!btn) {
              const btns = Array.from(document.querySelectorAll('button'));
              const target = btns.find(b => (b.textContent || '').trim().includes('הפק דוח'));
              if (target) { target.click(); return 'CLICKED_FALLBACK'; }
              return 'NOT_FOUND';
            }
            btn.click();
            return 'CLICKED';
          })()`,
          returnByValue: true,
        }),
      ]);

      const filename = download.suggestedFilename();
      const localPath = path.join(absDir, `${Date.now()}_${filename}`);
      await download.saveAs(localPath);
      results.push({ localPath, filename, templateId: rep.templateId });

    } catch (e: any) {
      // console.log(`[Analyst] Export failed for ${rep.name}:`, e?.message);
    }

    await page.waitForTimeout(2000);
  }

  return results;}