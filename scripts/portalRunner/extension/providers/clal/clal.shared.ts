import { providerAuthenticated, waitForProviderAuthentication, continueIfAuthenticated } from '../../auth-providers';
// Ported from the native provider; browser report keys replace local files.
import type { Page, Download } from "../../browser";
import type { RunnerCtx } from "../../types";
export function envBool(v: string | undefined, fallback = false) {
    if (v == null)
        return fallback;
    const s = String(v).trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(s))
        return true;
    if (["0", "false", "no", "n", "off"].includes(s))
        return false;
    return fallback;
}
async function softNetworkIdle(page: Page) {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => { });
}
async function waitAngularTick(page: Page, ms = 250) {
    await page.waitForTimeout(ms);
    await softNetworkIdle(page);
}
function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export async function openReportFromSummaryByName(page: Page, linkText: string) {
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
    await softNetworkIdle(page);
}
async function safeEvaluateBool(page: Page, script: string, fallback: boolean): Promise<boolean> {
    try {
        const result = await page.evaluate(script);
        return result === true;
    }
    catch (e: any) {
        if (String(e?.message || '').includes('Execution context was destroyed')) {
            return fallback;
        }
        throw e;
    }
}
async function waitForOtpDone(page: Page, timeoutMs = 15000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const ready = await page.evaluate(`
        !!document.querySelector('a[href*="Logout"], a[href*="logout"], #moduleHeaderSpan') || !document.querySelector('input[name="Token"]')
      `);
            if (ready)
                return true;
        }
        catch (e) {
        }
        await page.waitForTimeout(500).catch(() => { });
    }
    return false;
}
export async function clalHasLoginError(page: Page): Promise<boolean> {
    return safeEvaluateBool(page, `
    (function() {
      const cell = document.getElementById('credentials_table_postheader');
      if (!cell) return false;
      const txt = (cell.innerText || cell.textContent || '').trim();
      return txt.includes('שם המשתמש או הסיסמא שגויים');
    })()
  `, false);
}
export async function clalLogin(page: Page, username: string, password: string) {
    if (await providerAuthenticated(page,'clal')) return;
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
    })(${JSON.stringify(username)}, ${JSON.stringify(password)})
  `;
    try {
        await page.evaluate(injectionCode);
    }
    catch (e: any) {
        if (!String(e?.message || '').includes('Execution context was destroyed')) {
            throw e;
        }
    }
    await page.waitForTimeout(5000);
    const hasLoginError = await clalHasLoginError(page);
    if (hasLoginError) {
        throw new Error('כלל: פרטי ההתחברות (ת.ז/סיסמה) שגויים - הפורטל הציג "שם המשתמש או הסיסמא שגויים"');
    }
}
export async function clalHasWrongTokenError(page: Page): Promise<boolean> {
    return safeEvaluateBool(page, `
    (function() {
      const cell = document.getElementById('ctlErrorMessage');
      if (!cell) return false;
      const msg = cell.querySelector('.ErrorText');
      const txt = msg ? (msg.innerText || msg.textContent || '').trim() : '';
      return txt.includes('הקוד שהוזן אינו תקין');
    })()
  `, false);
}
export async function clalHandleOtp(page: Page, ctx: RunnerCtx) {
    if (await continueIfAuthenticated(page,ctx,'clal')) return;
    const { runId, setStatus, pollOtp, clearOtp, run } = ctx;
    const monthLabel = run?.monthLabel || "חודש נוכחי";
    await setStatus(runId, {
        status: "otp_required",
        step: "ממתין לקוד אימות מחברת כלל",
        "otp.mode": "firestore",
        monthLabel
    });
    const authentication_otpCode = await waitForProviderAuthentication(page,ctx,'clal');
    if (authentication_otpCode.kind === 'authenticated') return;
    const otpCode = authentication_otpCode.code;
    if (!otpCode)
        throw new Error("OTP Timeout: הקוד לא התקבל.");
    await setStatus(runId, {
        status: "running",
        step: "הקוד התקבל, מתחבר למערכת...",
        "otp.mode": "firestore"
    });
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
    })(${JSON.stringify(otpCode)})
  `;
    await page.evaluate(injectionScript);
    await waitForOtpDone(page, 15000);
    await clearOtp(runId).catch(() => { });
    const wrongToken = await clalHasWrongTokenError(page);
    if (wrongToken) {
        await setStatus(runId, {
            status: "otp_required",
            step: "הקוד הקודם היה שגוי - נסה שוב",
            "otp.mode": "firestore"
        });
        const authentication_otpCode2 = await waitForProviderAuthentication(page,ctx,'clal');
    if (authentication_otpCode2.kind === 'authenticated') return;
    const otpCode2 = authentication_otpCode2.code;
        if (!otpCode2)
            throw new Error("OTP Timeout (ניסיון שני)");
        await setStatus(runId, { status: "running", step: "הקוד התקבל, מתחבר למערכת...", "otp.mode": "firestore" });
        const retryScript = `
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
      })(${JSON.stringify(otpCode2)})
    `;
        await page.evaluate(retryScript);
        await waitForOtpDone(page, 15000);
        const stillWrong = await clalHasWrongTokenError(page);
        if (stillWrong) {
            throw new Error('כלל: קוד הזיהוי שגוי גם בניסיון השני - הפורטל הציג "הקוד שהוזן אינו תקין"');
        }
    }
    await setStatus(runId, { status: "logged_in", step: "clal_logged_in" });
}
export async function gotoCommissionsPage(page: Page): Promise<Page> {
    const [newPage] = await Promise.all([
        page.context().waitForEvent("page", { timeout: 60000 }),
        page.evaluate(`
      (async function() {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));

        const getLink = () => Array.from(document.querySelectorAll('a'))
          .find(a => a.innerText.includes('לפירוט עמלות') || a.innerText.includes('עמלות והפקות'));

        // polling: מחכים בפועל שהדף (או האקורדיון) יתייצבו, לא מנסים פעם
        // אחת בלבד - זה מה שגרם ל-timeout כשהדף עדיין לא היה מוכן.
        const maxAttempts = 30; // 30 * 1000ms = 30 שנ' טווח חיפוש
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          let target = getLink();

          if (!target) {
            const headers = Array.from(document.querySelectorAll('mat-expansion-panel-header'));
            const targetHeader = headers.find(header => {
              const h3 = header.querySelector('h3');
              return h3 && h3.innerText.includes('עמלות ומכירות');
            });

            if (targetHeader) {
              const isExpanded = targetHeader.getAttribute('aria-expanded') === 'true';
              if (!isExpanded) {
                const indicator = targetHeader.querySelector('.mat-expansion-indicator');
                if (indicator) {
                  indicator.click();
                } else {
                  targetHeader.click();
                }
                await wait(1500);
              }
            }

            target = getLink();
          }

          if (target) {
            target.click();
            return "SUCCESS";
          }
await wait(1000);
        }

        return "LINK_NOT_FOUND";
      })()
    `)
    ]);
    await newPage.bringToFront();
    await newPage.evaluate(`
    (function() {
      return new Promise((resolve) => {
        const start = Date.now();
        const interval = setInterval(() => {
          const ready = !!document.querySelector('#moduleHeaderSpan');
          if (ready || Date.now() - start > 20000) {
            clearInterval(interval);
            resolve(ready ? "READY" : "TIMEOUT");
          }
        }, 500);
      });
    })()
  `).catch(() => { });
    return newPage;
}
export async function waitClalLoaderGone(page: Page, timeoutMs = 15000) {
    const loader = page.locator("#loaderDiv");
    const exists = await loader.count().catch(() => 0);
    if (exists === 0)
        return;
    try {
        await loader.waitFor({ state: "hidden", timeout: timeoutMs });
    }
    catch (e) {
    }
}
export async function openAgentsDropdownAndSelectAll(page: Page, companyTaxId?: string) {
    const result = await page.evaluate(`
    (function(taxId) {
      return new Promise((resolve) => {
        const btn = document.querySelector('#drpAgentsNameBtn');
        if (!btn) return resolve("BTN_NOT_FOUND");
        btn.click();

        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;

          if (taxId) {
            const clearBtn = Array.from(document.querySelectorAll('button')).find(b =>
              (b.getAttribute('ng-click') || '').includes("select( 'none'")
            );
            if (clearBtn) {
              clearInterval(interval);
              clearBtn.click();
              resolve("CLEARED_FOR_TAXID");
            }
          } else {
            const allBtn = document.querySelector('.helperButton');
            const firstCheckbox = document.querySelector('.ui-multiselect-checkboxes li input');

            if (allBtn && (allBtn.offsetWidth > 0 || allBtn.offsetHeight > 0)) {
              clearInterval(interval);
              allBtn.click();
              resolve("SUCCESS_SELECTED_ALL");
            }
            else if (firstCheckbox) {
              clearInterval(interval);
              resolve("SUCCESS_SINGLE_AGENT_READY");
            }
          }

          if (attempts > 20) {
            clearInterval(interval);
            resolve("PROCEEDING_WITH_CURRENT_STATE");
          }
        }, 500);
      });
    })(${JSON.stringify(companyTaxId || null)})
  `);
    if (companyTaxId && result === "CLEARED_FOR_TAXID") {
        const filterFound = await page.evaluate(`
      (function() {
        const input = document.querySelector('input[ng-model="inputLabel.labelFilter"]');
        if (input) {
          input.click();
          input.focus();
          return true;
        }
        return false;
      })()
    `);
        if (filterFound) {
            await page.waitForTimeout(300);
            await page.keyboard.type(companyTaxId, { delay: 70 });
            await page.waitForTimeout(1500);
            const selectResult = await page.evaluate(`
        (function(taxId) {
          const labels = Array.from(document.querySelectorAll('label.custom-checkbox'));
          const target = labels.find(l => (l.innerText || l.textContent || '').includes(taxId));
          if (!target) return "NOT_FOUND";
          const input = target.querySelector('input[type="checkbox"]');
          if (!input) return "INPUT_NOT_FOUND";
          if (!input.checked) input.click();
          return "SELECTED";
        })('${companyTaxId.replace(/'/g, "\\'")}')
      `);
            if (selectResult !== "SELECTED") {
                throw new Error(`לא נמצאה/נבחרה חברה עם ח.פ ${companyTaxId} ברשימת הסינון של כלל (${selectResult})`);
            }
        }
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
}
export async function clickSearchOnly(page: Page) {
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
    await page.waitForTimeout(2000);
}
export async function waitForCommissionsGridFilled(page: Page, timeoutMs = 60000): Promise<string> {
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
  `) as string;
    return result;
}
export async function clickReportTabHeading(page: Page, headingText: string) {
    const result = await page.evaluate(`
    (function(txt) {
      const normalize = (s) => (s || "").replace(/\\s+/g, " ").trim();
      const targetText = normalize(txt);

      const tabs = Array.from(document.querySelectorAll('tab-heading'));
      
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
    await page.waitForTimeout(2500);
    await waitClalLoaderGone(page);
}
export async function exportExcelFromCurrentReport(page: Page): Promise<{
    download: Download | null;
    filename: string;
}> {
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
        const result = await page.evaluate(injection);
        if (result === "NOT_FOUND")
            return { download: null, filename: "" };
        const download = await page.waitForEvent("download", { timeout: 45000 });
        return { download, filename: download.suggestedFilename() };
    }
    catch (e) {
        return { download: null, filename: "" };
    }
}
