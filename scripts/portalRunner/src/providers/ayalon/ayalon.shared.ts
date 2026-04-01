import type { Page } from "playwright";
import type { RunnerCtx } from "../../types";
import fs from "fs";
import path from "path";

function escJsString(v: string) {
  return String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

export async function ayalonLogin(page: Page, u: string, p: string) {
  const user = escJsString(u);
  const pass = escJsString(p);

  const injection = `
    (function(user, pass) {
      return new Promise((resolve) => {
        let attempts = 0;
        const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;

        const interval = setInterval(() => {
          attempts++;

          const userInputs = Array.from(document.querySelectorAll('#input_1'));
          const passInputs = Array.from(document.querySelectorAll('#input_2'));
          const submitCandidates = Array.from(
            document.querySelectorAll('input[type="submit"], .credentials_input_submit')
          );

          const uInput = userInputs.find(isVisible);

          const pInput = passInputs.find((el) => {
            if (!isVisible(el)) return false;
            const placeholder = String(el.getAttribute('placeholder') || '').trim();
            const alt = String(el.getAttribute('alt') || '').trim();

            return (
              placeholder.includes("סיסמא") ||
              placeholder.includes("סיסמה") ||
              alt.includes("סיסמא") ||
              alt.includes("סיסמה")
            );
          });

          const btn = submitCandidates.find(isVisible);

          if (uInput && pInput && btn) {
            clearInterval(interval);

            uInput.value = user;
            pInput.value = pass;

            ['input', 'change', 'blur'].forEach((ev) => {
              uInput.dispatchEvent(new Event(ev, { bubbles: true }));
              pInput.dispatchEvent(new Event(ev, { bubbles: true }));
            });

            setTimeout(() => {
              btn.click();
              resolve("SUBMITTED");
            }, 500);

            return;
          }

          if (attempts > 60) {
            clearInterval(interval);
            resolve("TIMEOUT_FIELDS_NOT_FOUND");
          }
        }, 500);
      });
    })('${user}', '${pass}')
  `;

  const result = await page.evaluate(injection);
  console.log(`[Ayalon] Login submit result: ${result}`);

  if (result !== "SUBMITTED") {
    throw new Error(`לוגין לאיילון נכשל: ${String(result)}`);
  }
}

export async function ayalonHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, pollOtp, clearOtp, setStatus, run } = ctx;
  const monthLabel = run?.monthLabel || "חודש נוכחי";

  const otpCode = await pollOtp(runId);
  if (!otpCode) throw new Error("קוד ה-OTP לא התקבל.");

  await setStatus(runId, {
    status: "running",
    step: "מזריק קוד אימות...",
    monthLabel,
  });

  const code = escJsString(otpCode);

  const debugBefore: any = await page.evaluate(`
    (function() {
      const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
      const normalize = (val) => (val || "").replace(/\\s+/g, " ").trim();

      return {
        url: window.location.href,
        title: document.title,
        text: normalize(document.body.innerText).substring(0, 500),
        inputs: Array.from(document.querySelectorAll('input')).map(i => ({
          id: i.id || "",
          type: i.type || "",
          name: i.name || "",
          className: i.className || "",
          placeholder: i.getAttribute("placeholder") || "",
          alt: i.getAttribute("alt") || "",
          visible: isVisible(i),
          valueLen: (i.value || "").length
        }))
      };
    })()
  `);

  console.log("[Ayalon] Before OTP injection:", JSON.stringify(debugBefore, null, 2));

  const injection = `
    (function(code) {
      const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;

      const input2Candidates = Array.from(document.querySelectorAll('input#input_2'));
      const input = input2Candidates.find(isVisible);

      const submitCandidates = Array.from(
        document.querySelectorAll('input[type="submit"], .credentials_input_submit')
      );
      const btn = submitCandidates.find(isVisible);

      if (!input) return "NO_VISIBLE_INPUT_2";
      if (!btn) return "NO_VISIBLE_SUBMIT";

      input.value = code;

      ['input', 'change', 'blur'].forEach((ev) => {
        input.dispatchEvent(new Event(ev, { bubbles: true }));
      });

      setTimeout(() => {
        btn.click();
      }, 300);

      return "OTP_SUBMITTED";
    })('${code}')
  `;

  const result = await page.evaluate(injection);
  console.log(`[Ayalon] OTP submit result: ${result}`);

  await clearOtp(runId).catch(() => {});

  if (result !== "OTP_SUBMITTED") {
    throw new Error(`הזרקת ה-OTP נכשלה: ${String(result)}`);
  }
}

export async function ayalonNavigateToReport(page: Page) {
    console.log("[Ayalon] Navigating to reports page...");

  const reportsUrl = "https://portal.ayalon-ins.co.il/f5-w-68747470733a2f2f6167656e7473706f7274616c$$/reports/";
  await page.goto(reportsUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // ✅ CDP Session
  const cdp = await page.context().newCDPSession(page);

  const countResult = await cdp.send("Runtime.evaluate", {
    expression: "document.querySelectorAll('*').length",
    returnByValue: true,
  });
  console.log("[Ayalon] CDP elements count:", countResult.result.value);

  const fillResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const input = document.querySelector('#searchbox');
      if (!input) return 'NOT_FOUND';
      input.focus();
      input.value = 'נפרעים';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'FILLED: ' + input.value;
    })()`,
    returnByValue: true,
  });
  console.log("[Ayalon] CDP fill result:", fillResult.result.value);

  const clickResult = await cdp.send("Runtime.evaluate", {
    expression: `(function() {
      const btn = document.querySelector('#report-submit-button');
      if (!btn) return 'BTN_NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()`,
    returnByValue: true,
  });
  console.log("[Ayalon] CDP click result:", clickResult.result.value);

  await page.waitForTimeout(2000);
}


export async function ayalonHandlePopups(page: Page) {
  console.log("[Ayalon] Checking for blocking popups...");

  const popupSelector = 'div[id^="popup-"].popup-modal.uk-open, div.popup-modal.uk-open';
  const closeBtnSelector =
    'button.popup-close-btn[data-popup-id], button.popup-close-btn, button:has-text("סגירה"), button:has-text("סגור")';

  for (let round = 0; round < 6; round++) {
    await page.waitForTimeout(1000);

    const popups = page.locator(popupSelector);
    const popupCount = await popups.count().catch(() => 0);

    if (!popupCount) {
      console.log("[Ayalon] No blocking popup found.");
      return;
    }

    console.log(`[Ayalon] Found ${popupCount} open popup(s).`);

    let closedAny = false;

    for (let i = 0; i < popupCount; i++) {
      const popup = popups.nth(i);

      const popupId = await popup.getAttribute("id").catch(() => null);
      const popupText = await popup.textContent().catch(() => "");
      console.log(
        `[Ayalon] Popup detected: id=${popupId || "(no-id)"} text=${String(popupText || "")
          .trim()
          .slice(0, 150)}`
      );

      const closeBtn = popup.locator(closeBtnSelector).first();

      if (await closeBtn.isVisible().catch(() => false)) {
        console.log(`[Ayalon] Clicking popup close button for ${popupId || "(no-id)"}`);

        try {
          await closeBtn.click({ force: true, timeout: 5000 });
        } catch {
          await closeBtn.evaluate((el) => {
            (el as HTMLButtonElement).click();
          });
        }

        if (popupId) {
          await page.locator(`#${popupId}`).waitFor({ state: "hidden", timeout: 7000 }).catch(() => {});
        } else {
          await page.waitForTimeout(1500);
        }

        closedAny = true;
      }
    }

    if (!closedAny) {
      console.log("[Ayalon] Popup exists but close button was not clicked.");
      break;
    }
  }

  const stillOpen = await page.locator(popupSelector).count().catch(() => 0);
  if (stillOpen > 0) {
    throw new Error("נמצא popup פתוח שלא נסגר.");
  }

  console.log("[Ayalon] Popups cleared.");
}

export async function ayalonDumpCurrentPageElements(page: Page) {
  console.log("[Ayalon] --- DOM SNAPSHOT START ---");

  const aside = page.locator("#aside_container");
  console.log("[Ayalon] #aside_container count =", await aside.count().catch(() => 0));
  if (await aside.count().catch(() => 0)) {
    console.log("[Ayalon] #aside_container aria-hidden =", await aside.first().getAttribute("aria-hidden").catch(() => null));
    console.log("[Ayalon] #aside_container class =", await aside.first().getAttribute("class").catch(() => null));
  }

  const sideMenu = page.locator("nav#side-menu");
  console.log("[Ayalon] nav#side-menu count =", await sideMenu.count().catch(() => 0));
  if (await sideMenu.count().catch(() => 0)) {
    console.log("[Ayalon] nav#side-menu aria-label =", await sideMenu.first().getAttribute("aria-label").catch(() => null));
    console.log("[Ayalon] nav#side-menu class =", await sideMenu.first().getAttribute("class").catch(() => null));
  }

  const reportLinks = page.locator('a[href*="/reports/"]');
  const reportCount = await reportLinks.count().catch(() => 0);
  console.log("[Ayalon] a[href*='/reports/'] count =", reportCount);

  for (let i = 0; i < Math.min(reportCount, 5); i++) {
    const link = reportLinks.nth(i);
    console.log(`[Ayalon] reportLink[${i}] href =`, await link.getAttribute("href").catch(() => null));
    console.log(`[Ayalon] reportLink[${i}] title =`, await link.getAttribute("title").catch(() => null));
    console.log(`[Ayalon] reportLink[${i}] data-ga-label =`, await link.getAttribute("data-ga-label").catch(() => null));
    console.log(`[Ayalon] reportLink[${i}] text =`, await link.textContent().catch(() => null));
  }

  const allReportsTitleLinks = page.locator('a[title*="כל הדוחות שלי"]');
  console.log("[Ayalon] a[title*='כל הדוחות שלי'] count =", await allReportsTitleLinks.count().catch(() => 0));

  const gaLinks = page.locator('a[data-ga-label*="כל הדוחות שלי"]');
  console.log("[Ayalon] a[data-ga-label*='כל הדוחות שלי'] count =", await gaLinks.count().catch(() => 0));

  const searchBox = page.locator("#searchbox");
  console.log("[Ayalon] #searchbox count =", await searchBox.count().catch(() => 0));
  if (await searchBox.count().catch(() => 0)) {
    console.log("[Ayalon] #searchbox placeholder =", await searchBox.first().getAttribute("placeholder").catch(() => null));
    console.log("[Ayalon] #searchbox name =", await searchBox.first().getAttribute("name").catch(() => null));
  }

  const searchBtn = page.locator("#report-submit-button");
  console.log("[Ayalon] #report-submit-button count =", await searchBtn.count().catch(() => 0));
  if (await searchBtn.count().catch(() => 0)) {
    console.log("[Ayalon] #report-submit-button type =", await searchBtn.first().getAttribute("type").catch(() => null));
    console.log("[Ayalon] #report-submit-button text =", await searchBtn.first().textContent().catch(() => null));
  }

  console.log("[Ayalon] current url =", page.url());
  console.log("[Ayalon] --- DOM SNAPSHOT END ---");
}

export async function ayalonDumpFrames(page: Page) {
  console.log("[Ayalon] --- FRAMES DUMP START ---");

  const frames = page.frames();
  console.log("[Ayalon] frames count =", frames.length);

  for (let i = 0; i < frames.length; i++) {
    const fr = frames[i];
    try {
      console.log(`[Ayalon] frame[${i}] url = ${fr.url()}`);

      const asideCount = await fr.locator("#aside_container").count().catch(() => 0);
      const sideMenuCount = await fr.locator("nav#side-menu").count().catch(() => 0);
      const reportsCount = await fr.locator('a[href*="/reports/"]').count().catch(() => 0);
      const searchboxCount = await fr.locator("#searchbox").count().catch(() => 0);
      const searchBtnCount = await fr.locator("#report-submit-button").count().catch(() => 0);

      console.log(`[Ayalon] frame[${i}] #aside_container = ${asideCount}`);
      console.log(`[Ayalon] frame[${i}] nav#side-menu = ${sideMenuCount}`);
      console.log(`[Ayalon] frame[${i}] a[href*="/reports/"] = ${reportsCount}`);
      console.log(`[Ayalon] frame[${i}] #searchbox = ${searchboxCount}`);
      console.log(`[Ayalon] frame[${i}] #report-submit-button = ${searchBtnCount}`);
    } catch (e: any) {
      console.log(`[Ayalon] frame[${i}] dump failed: ${e?.message || e}`);
    }
  }

  console.log("[Ayalon] --- FRAMES DUMP END ---");
}


export async function ayalonFindPortalFrame(page: Page) {
  const frames = page.frames();

  for (const fr of frames) {
    try {
      const reportsCount = await fr.locator('a[href*="/reports/"]').count().catch(() => 0);
      const searchboxCount = await fr.locator("#searchbox").count().catch(() => 0);
      const sideMenuCount = await fr.locator("nav#side-menu").count().catch(() => 0);

      if (reportsCount > 0 || searchboxCount > 0 || sideMenuCount > 0) {
        console.log("[Ayalon] Portal frame found:", fr.url());
        return fr;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export async function ayalonDismissPopupQuick(page: Page) {
  console.log("[Ayalon] Trying quick popup dismiss...");

  for (let i = 0; i < 3; i++) {
    try {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);

      const closeBtn = page
        .locator('button.popup-close-btn[data-popup-id], button.popup-close-btn, button:has-text("סגירה"), button:has-text("סגור")')
        .first();

      if (await closeBtn.count().catch(() => 0)) {
        if (await closeBtn.isVisible().catch(() => false)) {
          console.log("[Ayalon] Visible close button found, clicking...");
          await closeBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(1000);
        }
      }

      const popupCount = await page
        .locator('div[id^="popup-"].popup-modal.uk-open, div.popup-modal.uk-open')
        .count()
        .catch(() => 0);

      console.log(`[Ayalon] Open popups after dismiss attempt ${i + 1}: ${popupCount}`);

      if (popupCount === 0) {
        console.log("[Ayalon] Popup dismissed.");
        return;
      }
    } catch (e: any) {
      console.log(`[Ayalon] Quick dismiss attempt ${i + 1} failed: ${e?.message || e}`);
    }
  }

  console.log("[Ayalon] Quick popup dismiss finished.");
}

export async function ayalonWaitForDashboardDom(page: Page, timeoutMs = 60000) {
  console.log("[Ayalon] Waiting for dashboard DOM...");

  const started = Date.now();
  let poll = 0;

  while (Date.now() - started < timeoutMs) {
    poll++;

    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    const asideCount = await page.locator("#aside_container").count().catch(() => 0);
    const sideMenuCount = await page.locator("nav#side-menu").count().catch(() => 0);
    const reportsCount = await page.locator('a[href*="/reports/"]').count().catch(() => 0);
    const reportsTitleCount = await page.locator('a[title*="כל הדוחות שלי"]').count().catch(() => 0);
    const searchboxCount = await page.locator("#searchbox").count().catch(() => 0);

    console.log(
      `[Ayalon] dashboard poll #${poll} -> aside=${asideCount}, sideMenu=${sideMenuCount}, reports=${reportsCount}, reportsTitle=${reportsTitleCount}, searchbox=${searchboxCount}, url=${page.url()}`
    );

    if (
      asideCount > 0 ||
      sideMenuCount > 0 ||
      reportsCount > 0 ||
      reportsTitleCount > 0 ||
      searchboxCount > 0
    ) {
      console.log("[Ayalon] Dashboard DOM detected.");
      return;
    }

    await page.waitForTimeout(2000);
  }

  throw new Error("הדשבורד לא נטען בזמן - האלמנטים לא זוהו גם אחרי המתנה ארוכה.");
}



export async function ayalonDumpArtifacts(page: Page, outDir: string, tag: string) {
  try {
    fs.mkdirSync(outDir, { recursive: true });

    const htmlPath = path.join(outDir, `ayalon_${tag}.html`);
    const bodyPath = path.join(outDir, `ayalon_${tag}_body.txt`);
    const metaPath = path.join(outDir, `ayalon_${tag}_meta.json`);

    const html = await page.locator("html").innerHTML().catch(() => "");
    const bodyText = await page.locator("body").textContent().catch(() => "");
    const url = page.url();

    fs.writeFileSync(htmlPath, html, "utf8");
    fs.writeFileSync(bodyPath, bodyText || "", "utf8");
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          url,
          htmlLength: html.length,
          bodyTextLength: (bodyText || "").length,
        },
        null,
        2
      ),
      "utf8"
    );

    console.log("[Ayalon] Dumped html:", htmlPath);
    console.log("[Ayalon] Dumped body text:", bodyPath);
    console.log("[Ayalon] Dumped meta:", metaPath);
  } catch (e: any) {
    console.log("[Ayalon] dump artifacts failed:", e?.message || e);
  }
}

export async function ayalonDismissPopupAggressive(page: Page) {
  console.log("[Ayalon] Aggressive popup dismiss...");

  try {
    await page.locator("body").click({ position: { x: 10, y: 10 }, force: true, timeout: 3000 }).catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(800);

    const closeByText = page.locator('button:has-text("סגירה"), button:has-text("סגור"), a:has-text("סגירה"), a:has-text("סגור")');
    const count = await closeByText.count().catch(() => 0);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const el = closeByText.nth(i);
      if (await el.isVisible().catch(() => false)) {
        console.log(`[Ayalon] clicking close text button #${i + 1}`);
        await el.click({ force: true, timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(700);
      }
    }

    await page.evaluate(`
      (function() {
        const sels = [
          '.popup-modal.uk-open',
          'div[id^="popup-"].uk-open',
          '.uk-modal.uk-open',
          '.modal-backdrop',
          '.popup-backdrop'
        ];

        for (const sel of sels) {
          document.querySelectorAll(sel).forEach((el) => {
            try {
              el.classList.remove('uk-open');
              el.setAttribute('aria-hidden', 'true');
              el.style.display = 'none';
              el.style.visibility = 'hidden';
              el.style.pointerEvents = 'none';
            } catch (e) {}
          });
        }
      })()
    `).catch(() => {});

    await page.waitForTimeout(1000);
  } catch (e: any) {
    console.log("[Ayalon] Aggressive dismiss failed:", e?.message || e);
  }
}