import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";
import path from "path";

/**
 * לוגין מיטב בגישת CDP (Ayalon Style)
 */
export async function meitavLogin(page: Page, idNumber: string, fullPhone: string) {
  console.log("[Meitav] Filling credentials via CDP...");

  // פיצול טלפון: 050-1234567
  const prefix = fullPhone.substring(0, 3);   // 050
  const suffix = fullPhone.substring(3);       // 1234567

  const cdp = await page.context().newCDPSession(page);

  const fillResult = await cdp.send("Runtime.evaluate", {
    expression: `(function(id, pref, phone) {
      const idInput = document.querySelector('#id-identity-input, input[name="identity"]');
      const prefSelect = document.querySelector('select[name="prefixPhone"]');
      const phoneInput = document.querySelector('input[name="phoneNumber"]');

      if (!idInput) return 'ID_INPUT_NOT_FOUND';
      if (!prefSelect) return 'PREFIX_SELECT_NOT_FOUND';
      if (!phoneInput) return 'PHONE_INPUT_NOT_FOUND';

      // מילוי ת"ז
      idInput.focus();
      idInput.value = id;
      idInput.dispatchEvent(new Event('input', { bubbles: true }));
      idInput.dispatchEvent(new Event('change', { bubbles: true }));
      idInput.dispatchEvent(new Event('blur', { bubbles: true }));

      // בחירת קידומת
      prefSelect.value = pref;
      prefSelect.dispatchEvent(new Event('change', { bubbles: true }));

      // מילוי 7 ספרות
      phoneInput.focus();
      phoneInput.value = phone;
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
      phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
      phoneInput.dispatchEvent(new Event('blur', { bubbles: true }));

      const btn = document.querySelector('button[type="submit"]');
      setTimeout(() => { if (btn) btn.click(); }, 600);

      return 'SUCCESS: id=' + idInput.value + ' prefix=' + prefSelect.value + ' phone=' + phoneInput.value;
    })('${idNumber}', '${prefix}', '${suffix}')`,
    returnByValue: true,
  });

  console.log("[Meitav] CDP Fill Result:", fillResult.result.value);
  if (!fillResult.result.value?.toString().startsWith('SUCCESS')) {
    throw new Error(`Login fields filling failed: ${fillResult.result.value}`);
  }
}
/**
 * טיפול ב-OTP מיטב בגישת CDP
 */
export async function meitavHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";

  console.log("[Meitav] Waiting for OTP input field...");
  
  const cdp = await page.context().newCDPSession(page);

  // ✅ המתן לשדה OTP דרך CDP
  for (let i = 0; i < 30; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('#codeDigitsInput, input[name="codeDigitsInput"]') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    console.log(`[Meitav] OTP check ${i+1}:`, check.result.value, page.url());
    if (check.result.value === 'FOUND') break;
    await page.waitForTimeout(1000);
  }

  await setStatus(runId, {
    status: "otp_required",
    step: "ממתין לקוד אימות ממיטב",
    "otp.mode": "firestore",
    monthLabel,
  });

  const otp = await pollOtp(runId);
  if (!otp) throw new Error("קוד ה-OTP לא התקבל");

  console.log("[Meitav] OTP received:", otp);

  // ✅ מצא מיקום השדה ולחץ פיזית
  const inputPos = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const input = document.querySelector('#codeDigitsInput, input[name="codeDigitsInput"]');
      if (!input) return null;
      const rect = input.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
    })()`,
    returnByValue: true,
  });
  console.log("[Meitav] OTP input position:", inputPos.result.value);

  const pos = JSON.parse(inputPos.result.value || 'null');
  if (!pos) throw new Error("OTP input position not found");

  // ✅ לחץ פיזית + הקלד כמו אדם
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  await page.keyboard.type(otp, { delay: 150 });
  await page.waitForTimeout(500);

  // ✅ לחץ על כפתור אישור
  const btnResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const btn = document.querySelector('button[ng-click="confirmPassword()"], button[type="submit"]');
      if (!btn) return 'BTN_NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  console.log("[Meitav] OTP btn:", btnResult.result.value);

  await page.waitForTimeout(5000);
  console.log("[Meitav] URL after OTP:", page.url());
  await clearOtp(runId).catch(() => {});
}
export async function meitavNavigateAndExport(
  page: Page,
  absDir: string
): Promise<{ localPath: string; filename: string }[]> {
  const results: { localPath: string; filename: string }[] = [];
  const cdp = await page.context().newCDPSession(page);

  // ✅ שלב 1: נווט לדוח עמלות
  const navResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const links = Array.from(document.querySelectorAll('a'));
      const target = links.find(a =>
        (a.textContent || '').includes('עמלות') ||
        (a.href || '').includes('agentamlot')
      );
      if (!target) return 'NOT_FOUND';
      target.click();
      return 'CLICKED: ' + target.href;
    })()`,
    returnByValue: true,
  });
  console.log("[Meitav] Nav result:", navResult.result.value);
  await page.waitForTimeout(5000);
  console.log("[Meitav] URL after nav:", page.url());

  // ✅ שלב 2: סגור dialog אם קיים
  await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return 'NO_DIALOG';
      const btn = dialog.querySelector('button');
      if (btn) { btn.click(); return 'CLOSED'; }
      return 'NO_BTN';
    })()`,
    returnByValue: true,
  });
  await page.waitForTimeout(1000);

  // ✅ שלב 3: קבל רשימת סוכנים
  const agentPos = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const input = document.querySelector('#selectedAgent');
      if (!input) return null;
      const rect = input.getBoundingClientRect();
      return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
    })()`,
    returnByValue: true,
  });

  const pos = JSON.parse(agentPos.result.value || 'null');
  if (!pos) throw new Error("Agent input not found");

  // ✅ שלב 4: לחץ פיזית על השדה
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(1000);

  // ✅ שלב 5: קבל רשימת סוכנים
  const agentsList = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const listbox = document.querySelector('#selectedAgent-listbox');
      if (!listbox) return '[]';
      const items = Array.from(listbox.querySelectorAll('li, [role="option"]'));
      return JSON.stringify(items.map(i => i.textContent?.trim()));
    })()`,
    returnByValue: true,
  });
  const agents: string[] = JSON.parse(agentsList.result.value || '[]');
  console.log("[Meitav] Agents:", agents);

  // ✅ שלב 6: לכל סוכן — בחר + הצג דוחות + ייצא
  for (let i = 0; i < agents.length; i++) {
    console.log(`[Meitav] Processing agent ${i+1}/${agents.length}: ${agents[i]}`);

    // לחץ שוב על השדה ובחר סוכן לפי index
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(800);

    for (let j = 0; j <= i; j++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    console.log("[Meitav] Agent selected:", agents[i]);

    // ✅ לחץ על "הצג דוחות"
    const searchResult = await cdp.send("Runtime.evaluate", {
      expression: `(function() {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => (b.textContent || '').trim().includes('הצג דוחות'));
        if (!btn) return 'NOT_FOUND';
        btn.click();
        return 'CLICKED';
      })()`,
      returnByValue: true,
    });
    console.log("[Meitav] Search:", searchResult.result.value);
    await page.waitForTimeout(5000);

    // ✅ ייצא לאקסל
    try {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 30000 }),
        cdp.send("Runtime.evaluate", {
          expression: `(function() {
            const btn = document.querySelector('button[class*="k-grid-excel"], button[kendogridexcelcommand]');
            if (!btn) return 'NOT_FOUND';
            btn.click();
            return 'CLICKED';
          })()`,
          returnByValue: true,
        }),
      ]);

      const filename = download.suggestedFilename();
      const localPath = path.join(absDir, `${Date.now()}_${filename}`);
      await download.saveAs(localPath);
      console.log("[Meitav] Saved:", localPath);
      results.push({ localPath, filename });
    } catch (e: any) {
      console.log("[Meitav] Export failed for agent:", agents[i], e?.message);
    }
  }

  return results;
}