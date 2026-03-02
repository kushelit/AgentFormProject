// scripts/portalRunner/src/providers/clal/clal.shared.ts
import type { Page, Download } from "playwright";
import type { RunnerCtx } from "../../types";

export function envBool(v: string | undefined, fallback = false) {
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

async function softNetworkIdle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function waitAngularTick(page: Page, ms = 250) {
  await page.waitForTimeout(ms);
  await softNetworkIdle(page);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * פונקציות ניווט מקוריות - הושארו כפי שהן
 */
export async function openReportFromSummaryByName(page: Page, linkText: string) {
  console.log(`[Clal] Searching for report link: ${linkText} via Injection...`);

  const injection = `
    (function(text) {
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const links = Array.from(document.querySelectorAll('.ui-grid-cell-contents a'));
          const target = links.find(a => a.innerText && a.innerText.trim() === text);

          if (target) {
            clearInterval(interval);
            target.click();
            resolve("SUCCESS");
          }
          if (attempts > 60) {
            clearInterval(interval);
            resolve("TIMEOUT");
          }
        }, 500);
      });
    })('${linkText}')
  `;

  const result = await page.evaluate(injection).catch(e => "ERROR: " + e.message);
  console.log(`[Clal] Click report '${linkText}' result: ${result}`);
  
  await softNetworkIdle(page);
}

export async function clickReportTabHeading(page: Page, headingText: string) {
  console.log(`[Clal] Switching to tab: ${headingText} via Injection...`);

  const injection = `
    (function(text) {
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const elements = Array.from(document.querySelectorAll('tab-heading, a, span, button'));
          const target = elements.find(el => el.innerText && el.innerText.trim() === text);

          if (target) {
            clearInterval(interval);
            const clickable = target.closest('a') || target;
            clickable.click();
            resolve("SUCCESS");
          }

          if (attempts > 40) {
            clearInterval(interval);
            resolve("NOT_FOUND");
          }
        }, 500);
      });
    })('${headingText}')
  `;

  const result = await page.evaluate(injection).catch(e => "ERROR: " + e.message);
  console.log(`[Clal] Tab switch '${headingText}' result: ${result}`);

  // המתנה קלה לרנדור
  await waitAngularTick(page, 500);
}
/**
 * פונקציית לוגין - הזרקה נקייה (ללא TS בתוך ה-eval)
 */
export async function clalLogin(page: Page, username: string, password: string) {
  console.log("[ClalLogin] Policy page detected. Injecting via String...");

  const injectionCode = `
    (function(u, p) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const user = document.querySelector('#input_1');
        const pass = document.querySelector('#input_2');
        const btn = document.querySelector('#btLogin_ctl09');

        if (user && pass && btn) {
          clearInterval(interval);
          user.value = u;
          pass.value = p;
          user.dispatchEvent(new Event('input', { bubbles: true }));
          pass.dispatchEvent(new Event('input', { bubbles: true }));
          btn.click();
        }

        if (attempts > 60) clearInterval(interval);
      }, 500);
    })('${username}', '${password}')
  `;

  try {
    await page.evaluate(injectionCode);
    await page.waitForTimeout(5000);
    console.log("[ClalLogin] Injection script sent to browser.");
  } catch (e: any) {
    console.error("[ClalLogin] Execution error: " + e.message);
  }
}

/**
 * טיפול ב-OTP ידני - חסין ל-EXE
 */
export async function clalHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus } = ctx;
  console.log("[Clal] Checking for OTP requirements...");

  const isOtpVisible = await page.evaluate(`document.querySelector('input[name="Token"]') !== null`).catch(() => false);

  if (!isOtpVisible) {
    console.log("[Clal] No OTP field detected.");
    return;
  }

  await setStatus(runId, { status: "otp_required", step: "clal_otp_required_manual" });
  
  console.log("--------------------------------------------------");
  console.log("👉 ACTION REQUIRED: ENTER OTP IN THE BROWSER NOW 👈");
  console.log("--------------------------------------------------");

  const checkLoginSuccessScript = `
    (function() {
      const text = document.body.innerText || "";
      return text.includes("התנתק") || text.includes("שלום,");
    })()
  `;

  try {
    await page.waitForFunction(checkLoginSuccessScript, { timeout: 180000 });
    console.log("[Clal] OTP success detected.");
  } catch (e) {
    console.log("[Clal] OTP Wait timed out. Continuing anyway...");
  }

  await page.waitForTimeout(5000);
  await setStatus(runId, { status: "logged_in", step: "clal_logged_in" });
}

/**
 * מעבר לדף עמלות - חסין ל-EXE
 */

export async function gotoCommissionsPage(page: Page): Promise<Page> {
  console.log("[Clal] Fast-Scanning for Commissions link...");

  const injection = `
    (function() {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          const target = Array.from(document.querySelectorAll('a'))
            .find(a => a.innerText.includes('לפירוט עמלות') || a.innerText.includes('עמלות והפקות'));
          if (target) {
            clearInterval(interval);
            target.click();
            resolve("SUCCESS");
          }
        }, 200); // בדיקה כל 200ms במקום 500ms
      });
    })()
  `;

  const [newPage] = await Promise.all([
    page.context().waitForEvent("page", { timeout: 60000 }),
    page.evaluate(injection)
  ]);

  await newPage.bringToFront();
  return newPage;
}
/**
 * בחירת סוכנים - חסין ל-EXE (נקי מ-TypeScript ב-eval)
 */
// export async function openAgentsDropdownAndSelectAll(page: Page) {
//   console.log("[Clal] Handling Agents dropdown...");

//   const injection = `
//     (function() {
//       return new Promise((resolve) => {
//         let attempts = 0;
//         const interval = setInterval(() => {
//           attempts++;
//           const btn = document.querySelector('#drpAgentsNameBtn');
//           if (btn) {
//             clearInterval(interval);
//             btn.click();
//             setTimeout(() => {
//               const allBtn = Array.from(document.querySelectorAll('button, a, span'))
//                 .find(el => el.innerText && el.innerText.includes('בחר הכל'));
//               if (allBtn) allBtn.click();
//               resolve("SUCCESS");
//             }, 1000);
//           }
//           if (attempts > 80) {
//             clearInterval(interval);
//             resolve("TIMEOUT");
//           }
//         }, 500);
//       });
//     })()
//   `;

//   await page.evaluate(injection).catch(e => console.error("[Clal] Dropdown Error: " + e.message));
//   await page.keyboard.press("Escape");
// }

/**
 * בחירת חודש וחיפוש - חסין ל-EXE (נקי מ-TypeScript ב-eval)
//  */
// export async function selectMonthAndSearch(page: Page, monthLabel?: string) {
//   console.log("[Clal] Selecting month and searching...");

//   const injection = `
//     (function(label) {
//       if (label) {
//         const select = document.querySelector('select[ng-model="selectedMonth"]');
//         if (select) {
//           const options = Array.from(select.options);
//           const option = options.find(o => o.text.includes(label));
//           if (option) {
//             select.value = option.value;
//             select.dispatchEvent(new Event('change', { bubbles: true }));
//           }
//         }
//       }
//       const searchBtn = document.querySelector('button[ng-click="search()"]');
//       if (searchBtn) searchBtn.click();
//       return "CLICKED";
//     })('${monthLabel || ""}')
//   `;

//   await page.evaluate(injection).catch(() => {});
//   await softNetworkIdle(page);
// }

export async function selectMonthAndSearch(page: Page, monthLabel?: string) {
  console.log(`[Clal] Opening Select and choosing: ${monthLabel}`);

  const injection = `
    (function(label) {
      if (!label) return "NO_LABEL";
      
      const select = document.querySelector('select[ng-model="selectedMonth"]');
      if (!select) return "SELECT_NOT_FOUND";

      // 1. "עוררות" האלמנט על ידי לחיצה
      select.click();
      select.focus();

      const options = Array.from(select.options);
      // חיפוש האופציה (למשל "פברואר 2026")
      const targetOption = options.find(o => o.text.trim().includes(label));
      
      if (targetOption) {
        select.value = targetOption.value;
        
        // 2. הפעלת אירועי השינוי של Angular
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        
        // 3. לחיצה על כפתור החיפוש לאחר השהייה קלה לרנדור
        setTimeout(() => {
          const searchBtn = document.querySelector('button[ng-click="search()"]');
          if (searchBtn) searchBtn.click();
        }, 1000);
        
        return "SUCCESS";
      }
      return "OPTION_NOT_FOUND";
    })('${monthLabel || ""}')
  `;

  await page.evaluate(injection);
  await waitAngularTick(page, 2000);
}
/**
 * המתנה לטעינת הגריד - חסין ל-EXE
 */
export async function waitForCommissionsGridFilled(page: Page, timeoutMs = 60000) {
  console.log("[Clal] Waiting for grid...");

  const injection = `
    (function(timeout) {
      return new Promise((resolve) => {
        const start = Date.now();
        const interval = setInterval(() => {
          const hasRows = document.querySelectorAll('.ui-grid-row').length > 0;
          const noData = document.body.innerText.includes("אין נתונים") || document.querySelector('.ui-grid-empty');
          
          if (hasRows) { clearInterval(interval); resolve("DATA"); }
          else if (noData) { clearInterval(interval); resolve("NO_DATA"); }
          else if (Date.now() - start > timeout) { clearInterval(interval); resolve("TIMEOUT"); }
        }, 1000);
      });
    })(${timeoutMs})
  `;

  const result = await page.evaluate(injection).catch(() => "ERROR");
  console.log("[Clal] Grid result: " + result);
}

/**
 * הורדת אקסל - חסין ל-EXE (נקי מ-TypeScript ב-eval)
 */
export async function exportExcelFromCurrentReport(page: Page): Promise<{ download: Download | null; filename: string }> {
  console.log("[Clal] Targeted Excel Export (Ignoring PDF)...");

  const injection = `
    (function() {
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const elements = Array.from(document.querySelectorAll('a, button, .export-btn'));
          
          const btn = elements.find(el => {
            const style = window.getComputedStyle(el);
            const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0 && style.display !== 'none';
            const txt = (el.innerText || "").toLowerCase();
            
            // שינוי קריטי: חייב לכלול אקסל ושאסור שיכלול PDF
            return isVisible && txt.includes('אקסל') && !txt.includes('pdf');
          });

          if (btn) {
            clearInterval(interval);
            btn.click();
            resolve("CLICKED");
          }
          if (attempts > 40) { clearInterval(interval); resolve("NOT_FOUND"); }
        }, 500);
      });
    })()
  `;

  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 45000 });
    const result = await page.evaluate(injection);
    if (result === "NOT_FOUND") return { download: null, filename: "" };
    const download = await downloadPromise;
    return { download, filename: download.suggestedFilename() };
  } catch (e) {
    return { download: null, filename: "" };
  }
}