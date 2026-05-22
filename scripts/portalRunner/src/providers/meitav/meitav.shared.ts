import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";
import path from "path";

/**
 * לוגין מיטב בגישת CDP (Ayalon Style)
 */
export async function meitavLogin(page: Page, idNumber: string, fullPhone: string) {
  // console.log("[Meitav] Filling credentials via CDP...");

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

  // console.log("[Meitav] CDP Fill Result:", fillResult.result.value);
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

  // console.log("[Meitav] Waiting for OTP input field...");
  
  const cdp = await page.context().newCDPSession(page);

  // ✅ המתן לשדה OTP דרך CDP
  for (let i = 0; i < 30; i++) {
    const check = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelector('#codeDigitsInput, input[name="codeDigitsInput"]') ? 'FOUND' : 'NOT_FOUND'`,
      returnByValue: true,
    });
    // console.log(`[Meitav] OTP check ${i+1}:`, check.result.value, page.url());
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

  // console.log("[Meitav] OTP received:", otp);

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
  // console.log("[Meitav] OTP input position:", inputPos.result.value);

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
  // console.log("[Meitav] OTP btn:", btnResult.result.value);

  await page.waitForTimeout(5000);
  // console.log("[Meitav] URL after OTP:", page.url());
  await clearOtp(runId).catch(() => {});
}


export async function meitavNavigateAndExport(
  page: Page,
  absDir: string
): Promise<{ localPath: string; filename: string; agentName: string }[]> {  // ✅ הוספת agentName
  const results: { localPath: string; filename: string; agentName: string }[] = [];
  const cdp = await page.context().newCDPSession(page);

  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const prevMonthNum = String(prevMonth.getMonth() + 1);
  const prevYear = String(prevMonth.getFullYear());
  // console.log(`[Meitav] Target: ${prevYear}/${prevMonthNum}`);

  async function getPos(selector: string) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `(function() {
        const el = document.querySelector('${selector}');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
      })()`,
      returnByValue: true,
    });
    return JSON.parse(result.result.value || 'null');
  }

  async function openAndSelectByValue(selector: string, dataValue: string, label: string) {
    const pos = await getPos(selector);
    if (!pos) { console.log(`[Meitav] ${label} not found`); return false; }

    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(1000);

    const result = await cdp.send("Runtime.evaluate", {
      expression: `(function(val) {
        const options = Array.from(document.querySelectorAll('[role="option"]'));
        const target = options.find(o => o.getAttribute('data-value') === val);
        if (!target) return 'NOT_FOUND: ' + options.map(o => o.getAttribute('data-value')).join(' | ');
        target.click();
        return 'CLICKED: ' + target.textContent?.trim();
      })('${dataValue}')`,
      returnByValue: true,
    });
    // console.log(`[Meitav] ${label}:`, result.result.value);
    await page.waitForTimeout(500);
    return true;
  }

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
  // console.log("[Meitav] Nav result:", navResult.result.value);
  await page.waitForTimeout(5000);

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
  const agentPos = await getPos('#selectedAgent');
  if (!agentPos) throw new Error("Agent input not found");

  await page.mouse.click(agentPos.x, agentPos.y);
  await page.waitForTimeout(1500);

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
console.log("[Meitav] Agents found:", JSON.stringify(agents));

if (agents.length === 0) throw new Error("No agents found");

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // ✅ שלב 4: לופ על כל הסוכנים
  for (let i = 0; i < agents.length; i++) {
    const agentName = agents[i];
    // console.log(`[Meitav] Processing agent ${i + 1}/${agents.length}: ${agentName}`);

  // בחר סוכן לפי index
    await page.mouse.click(agentPos.x, agentPos.y);
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);

    const selectResult = await cdp.send("Runtime.evaluate", {
      expression: `(function(idx) {
        const listbox = document.querySelector('#selectedAgent-listbox');
        if (!listbox) return 'NO_LISTBOX';
        const items = Array.from(listbox.querySelectorAll('li, [role="option"]'));
        if (!items[idx]) return 'NO_ITEM_' + idx;
        items[idx].click();
        return 'CLICKED: ' + items[idx].textContent?.trim();
      })(${i})`,
      returnByValue: true,
    });
    console.log(`[Meitav] Agent select by index:`, selectResult.result.value);
    await page.waitForTimeout(1000);

    // בחר סוג דוח
    await openAndSelectByValue('#selectReportType', '102', 'Report type');

    // בחר שנה
    await openAndSelectByValue('#selectedYear', prevYear, 'Year');

    // בחר חודש
    await openAndSelectByValue('#selectedMonth', prevMonthNum, 'Month');

    // ✅ לחץ על "הצג דוחות" - פיזית לפי קלאס
    const searchBtnPos = await getPos('.col-md-2.searchBtn');
    if (!searchBtnPos) {
      // console.log("[Meitav] searchBtn not found by class, trying text fallback...");
      await cdp.send("Runtime.evaluate", {
        expression: `(function() {
          const divs = Array.from(document.querySelectorAll('div'));
          const btn = divs.find(d => (d.textContent || '').trim().includes('הצג דוחות'));
          if (btn) btn.click();
        })()`,
        returnByValue: true,
      });
    } else {
      await page.mouse.click(searchBtnPos.x, searchBtnPos.y);
    }
    // console.log("[Meitav] Search button clicked");
    await page.waitForTimeout(5000);

    // ✅ המתן שה-resDownload יופיע (עד 15 שניות)
    for (let w = 0; w < 15; w++) {
      const check = await cdp.send("Runtime.evaluate", {
        expression: `document.querySelector('div.resDownload') ? 'FOUND' : 'NOT_FOUND'`,
        returnByValue: true,
      });
      if (check.result.value === 'FOUND') break;
      // console.log(`[Meitav] Waiting for resDownload... (${w + 1})`);
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(2000);

    // ✅ הורד קובץ
    try {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 30000 }),
        cdp.send("Runtime.evaluate", {
          expression: `(function() {
            const btn = document.querySelector('div.resDownload');
            if (!btn) return 'NOT_FOUND';
            btn.click();
            return 'CLICKED: ' + btn.textContent?.trim();
          })()`,
          returnByValue: true,
        }),
      ]);

      const filename = download.suggestedFilename();
      const localPath = path.join(absDir, `${Date.now()}_${filename}`);
      await download.saveAs(localPath);
      // console.log("[Meitav] Saved:", localPath);
      
      // ✅ שומרים גם את שם הסוכן
      results.push({ localPath, filename, agentName });

    } catch (e: any) {
      // console.log("[Meitav] Export failed for agent:", agentName, e?.message);
    }

    // ✅ המתנה קצרה בין סוכנים
    await page.waitForTimeout(1000);
  }

  return results;
}