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
 * פתיחת דוח לפי שם (הזרקת String)
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

/**
 * פונקציית לוגין (הזרקת String)
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


export async function clalHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";

  console.log("[Clal] OTP Flow: Waiting for user input in Magic...");

  // 1. מעוררים את המודאל
  await setStatus(runId, { 
    status: "otp_required", 
    step: "ממתין לקוד אימות מחברת כלל", 
    "otp.mode": "firestore",
    monthLabel 
  });

  // 2. מחכים לקוד
const otpCode = await pollOtp(runId);
  if (!otpCode) throw new Error("OTP Timeout: הקוד לא התקבל.");

  console.log(`[Clal] Code received: ${otpCode}.`);

  // --- תיקון 1: סגירת המודאל במגיק מיד עם קבלת הקוד ---
  // שינוי הסטטוס ל-running יגרום למודאל להיעלם מהמסך של הסוכן
  await setStatus(runId, { 
    status: "running", 
    step: "הקוד התקבל, מתחבר למערכת...",
    "otp.mode": "firestore" 
  });

  // 3. הזרקת הקוד (בדיוק כמו בלוגין)
  const injectionScript = `
    (function(code) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const input = document.querySelector('input[name="Token"]'); 
        const btn = document.querySelector('#btLogin_ctl09');

        if (input && btn) {
          clearInterval(interval);
          input.value = code;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          
          setTimeout(() => btn.click(), 100);
        }
        if (attempts > 40) clearInterval(interval);
      }, 500);
    })('${otpCode}')
  `;

  await page.evaluate(injectionScript);

  // --- תיקון 2: בדיקת הצלחה גמישה (Serialization-Proof) ---
  console.log("[Clal] Waiting for navigation or dashboard elements...");
  
  try {
    // מחכים שהשדה ייעלם או שיופיע אלמנט של דף הבית
    // שימוש במחרוזת טקסט מונע את שגיאת ה-not well-serializable
    await page.waitForFunction(
      "!!document.querySelector('a[href*=\"Logout\"], a[href*=\"logout\"], #moduleHeaderSpan') || !document.querySelector('input[name=\"Token\"]')",
      { timeout: 15000 }
    );
    console.log("[Clal] Dashboard detected ✅");
  } catch (e) {
    // אם עבר הזמן אבל הבוט כבר בדף הבית (כמו שתיארת), אנחנו לא רוצים לזרוק שגיאה שתעצור הכל.
    // אנחנו פשוט נמשיך הלאה ונבדוק אם דף העמלות זמין.
    console.log("[Clal] Verification timeout reached, but proceeding anyway to check for commissions link.");
  }

  // 4. ניקוי וסיום השלב
  await clearOtp(runId).catch(() => {});
  await setStatus(runId, { status: "logged_in", step: "clal_logged_in" });
}


/**
 * מעבר לדף עמלות (הזרקת String)
 */
export async function gotoCommissionsPage(page: Page): Promise<Page> {
  console.log("[Clal] Clicking Commissions link and waiting for new tab...");

  const [newPage] = await Promise.all([
    page.context().waitForEvent("page", { timeout: 60000 }),
    page.evaluate(`
      (function() {
        const target = Array.from(document.querySelectorAll('a'))
          .find(a => a.innerText.includes('לפירוט עמלות') || a.innerText.includes('עמלות והפקות'));
        if (target) target.click();
      })()
    `)
  ]);

  await newPage.bringToFront();
  console.log("[Clal] Verifying page header: תמונת עמלות");
  await newPage.waitForSelector("#moduleHeaderSpan", { state: "visible", timeout: 45000 }).catch(() => {});

  return newPage;
}

export async function waitClalLoaderGone(page: Page, timeoutMs = 15000) {
  const loader = page.locator("#loaderDiv");
  const exists = await loader.count().catch(() => 0);
  if (exists === 0) return;

  try {
    await loader.waitFor({ state: "hidden", timeout: timeoutMs });
    console.log("[Clal] Loader gone ✅");
  } catch (e) {
    console.log("[Clal] Loader already gone or timed out.");
  }
}

/**
 * בחירת כל הסוכנים (הזרקת String - חסין שגיאות סריאליזציה)
 */
export async function openAgentsDropdownAndSelectAll(page: Page) {
  console.log("[Clal] Opening agents list (Smart Check)...");

  const result = await page.evaluate(`
    (function() {
      return new Promise((resolve) => {
        const btn = document.querySelector('#drpAgentsNameBtn');
        if (!btn) return resolve("BTN_NOT_FOUND");
        btn.click(); 

        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          
          const allBtn = document.querySelector('.helperButton'); 
          // כאן הבדיקה של ה-input הראשון ברשימה
          const firstCheckbox = document.querySelector('.ui-multiselect-checkboxes li input'); 

          if (allBtn && (allBtn.offsetWidth > 0 || allBtn.offsetHeight > 0)) {
            clearInterval(interval);
            allBtn.click();
            resolve("SUCCESS_SELECTED_ALL");
          } 
          else if (firstCheckbox) {
            clearInterval(interval);
            // מצאנו לפחות סוכן אחד, אפשר להמשיך בלי לחכות 20 שניות
            resolve("SUCCESS_SINGLE_AGENT_READY");
          }

          if (attempts > 20) { 
            clearInterval(interval);
            resolve("PROCEEDING_WITH_CURRENT_STATE");
          }
        }, 500);
      });
    })()
  `);

  console.log(`[Clal] Agents result: ${result}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}
/**
 * לחיצה על חיפוש (הזרקת String)
 */
export async function clickSearchOnly(page: Page) {
  console.log("[Clal] Clicking Search (String injection)...");

  const result = await page.evaluate(`
    (function() {
      const btn = document.querySelector('button[ng-click="search()"]');
      if (btn) {
        btn.click();
        return "CLICKED";
      }
      return "NOT_FOUND";
    })()
  `);

  console.log(`[Clal] Search click result: ${result}`);
  await page.waitForTimeout(2000);
}

/**
 * המתנה לטבלה (הזרקת String)
 */
export async function waitForCommissionsGridFilled(page: Page, timeoutMs = 60000) {
  console.log("[Clal] Waiting for grid...");

  const result = await page.evaluate(`
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
  `);

  console.log("[Clal] Grid result: " + result);
}

/**
 * החלפת טאב (הזרקת String - חסין שגיאות סריאליזציה)
 */

export async function clickReportTabHeading(page: Page, headingText: string) {
  console.log(`[Clal] Switching tab to EXACT match: ${headingText}`);

  const result = await page.evaluate(`
    (function(txt) {
      const normalize = (s) => (s || "").replace(/\\s+/g, " ").trim();
      const targetText = normalize(txt);

      const tabs = Array.from(document.querySelectorAll('tab-heading'));
      
      // שינוי קריטי: מחפשים התאמה מדויקת של כל הטקסט בטאב
      const target = tabs.find(t => normalize(t.textContent) === targetText);

      if (target) {
        const li = target.closest('li');
        if (li && li.classList.contains('active')) return "ALREADY_ACTIVE";
        
        const link = target.closest('a');
        if (link) link.click();
        else target.click();
        return "CLICKED";
      }
      return "NOT_FOUND";
    })('${headingText}')
  `);

  console.log(`[Clal] Tab Result: ${result}`);
  
  // המתנה קצרה שהתוכן יתחלף
  await page.waitForTimeout(2500);
  await waitClalLoaderGone(page);
}

/**
 * יצוא אקסל (הזרקת String)
 */
export async function exportExcelFromCurrentReport(page: Page): Promise<{ download: Download | null; filename: string }> {
  console.log("[Clal] Targeted Excel Export...");

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