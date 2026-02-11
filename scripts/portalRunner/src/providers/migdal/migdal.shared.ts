// scripts/portalRunner/src/providers/migdal/migdal.shared.ts
import type { Page, Frame, Locator, Download, BrowserContext, Response } from "playwright";
import type { RunnerCtx } from "../../types";
import fs from "fs";
import path from "path";
import JSZip from "jszip";

/* =========================
   Utils
========================= */

export function envBool(v: string | undefined, fallback = false) {
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

async function softNetworkIdle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  // במגדל networkidle יכול "להיתקע" בגלל פינגים/אנליטיקס — אז לא לחסום על זה
  await page.waitForLoadState("networkidle").catch(() => {});
}

function loginSelectors() {
  return {
    clickHere: 'a:has-text("לחץ כאן")',
    username: "#input_1",
    password: "#input_2",
    submit: "input.credentials_input_submit",
    otp: 'input[name="otp"], input.credentials_input_password[name="otp"]',
    arrived: "#goToHome",
  };
}

async function findFrameWithSelector(page: Page, selector: string): Promise<Frame | null> {
  for (const fr of page.frames()) {
    const c = await fr.locator(selector).count().catch(() => 0);
    if (c > 0) return fr;
  }
  return null;
}

async function waitUntilEnabled(locator: Locator, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const disabled = await locator.isDisabled().catch(() => false);
    if (!disabled) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log("[Migdal] element still disabled after", timeoutMs, "ms");
}

async function pickActivePage(ctx: BrowserContext, current: Page): Promise<Page> {
  if (!current.isClosed()) return current;

  const pages = ctx.pages().filter((p) => !p.isClosed());
  if (pages.length) return pages[pages.length - 1];

  const p = await ctx.waitForEvent("page", { timeout: 60_000 });
  await p.waitForLoadState("domcontentloaded").catch(() => {});
  return p;
}

async function locatorInAnyFrame(page: Page, selector: string): Promise<Locator> {
  const main = page.locator(selector);
  if ((await main.count().catch(() => 0)) > 0) return main;

  for (const f of page.frames()) {
    const loc = f.locator(selector);
    if ((await loc.count().catch(() => 0)) > 0) return loc;
  }

  return main;
}

function fileSizeSafe(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function withAttemptSuffix(filePath: string, attempt: number) {
  if (attempt <= 1) return filePath;
  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length);
  return `${base}__retry${attempt}${ext || ""}`;
}

function filenameFromContentDisposition(cd: string | null | undefined): string | null {
  if (!cd) return null;
  const m1 = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (m1?.[1]) return decodeURIComponent(m1[1].trim().replace(/(^"|"$)/g, ""));
  const m2 = cd.match(/filename\s*=\s*("?)([^";]+)\1/i);
  if (m2?.[2]) return m2[2].trim();
  return null;
}

function extFromContentType(ct: string | null | undefined) {
  const s = (ct || "").toLowerCase();
  if (s.includes("zip")) return ".zip";
  if (s.includes("spreadsheetml") || s.includes("excel")) return ".xlsx";
  if (s.includes("csv")) return ".csv";
  return "";
}

async function saveDownload(download: Download, dir: string, attempt: number) {
  const suggested = download.suggestedFilename();
  const basePath = path.join(dir, suggested);
  const filePath = withAttemptSuffix(basePath, attempt);

  await download.saveAs(filePath);

  try {
    const fd = await fs.promises.open(filePath, "r");
    await fd.sync();
    await fd.close();
  } catch {}

  return filePath;
}

async function saveResponseBodyToFile(resp: Response, dir: string, attempt: number) {
  const headers = await resp.allHeaders().catch(() => ({} as any));
  const cd = headers["content-disposition"] || headers["Content-Disposition"];
  const ct = headers["content-type"] || headers["Content-Type"];

  const nameFromCd = filenameFromContentDisposition(cd);
  const ext = extFromContentType(ct) || path.extname(nameFromCd || "");
  const baseName = nameFromCd ? path.basename(nameFromCd) : `migdal_export${ext || ".zip"}`;

  const filePath = withAttemptSuffix(path.join(dir, baseName), attempt);
  const buf = await resp.body();
  await fs.promises.writeFile(filePath, buf);

  try {
    const fd = await fs.promises.open(filePath, "r");
    await fd.sync();
    await fd.close();
  } catch {}

  return { filePath, bytes: buf.length, ct: ct || null, cd: cd || null };
}

/* =========================
   ✅ Debug helpers
========================= */

function safePart(s: string) {
  return String(s || "")
    .replace(/[^\w\d\-_.]+/g, "_")
    .slice(0, 120);
}

export async function migdalDebugSnapshot(params: { page: Page; dir: string; label: string }) {
  const { page, dir, label } = params;

  fs.mkdirSync(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${ts}__${safePart(label)}`;

  const pngPath = path.join(dir, `${base}.png`);
  const htmlPath = path.join(dir, `${base}.html`);
  const urlPath = path.join(dir, `${base}.url.txt`);

  await fs.promises.writeFile(urlPath, page.url(), "utf8").catch(() => {});
  const html = await page.content().catch(() => "");
  await fs.promises.writeFile(htmlPath, html, "utf8").catch(() => {});
  await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});

  return { pngPath, htmlPath, urlPath };
}

async function debugElementShot(locator: Locator, dir: string, label: string) {
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${ts}__${safePart(label)}`;
  const pngPath = path.join(dir, `${base}.element.png`);

  try {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.screenshot({ path: pngPath }).catch(() => {});
  } catch {}

  return { pngPath };
}

async function dumpOuterHTML(page: Page, selector: string, dir: string, label: string) {
  fs.mkdirSync(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${ts}__${safePart(label)}`;
  const outPath = path.join(dir, `${base}.outerHTML.txt`);

  const html = await page
    .evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return `NOT_FOUND selector=${sel}`;
      return (el as HTMLElement).outerHTML;
    }, selector)
    .catch((e) => `EVALUATE_FAILED selector=${selector} err=${String(e)}`);

  await fs.promises.writeFile(outPath, html || "", "utf8").catch(() => {});
  console.log("[Migdal][DEBUG] outerHTML saved:", outPath);
  return { outPath };
}

/* =========================
   ✅ No-loading overlay
========================= */

export async function migdalWaitNoLoading(page: Page, timeoutMs = 120_000) {
  const spinnerSelectors = [
    "#messageYesNoDialogSpinner",
    "#messageYesNoDialog",
    ".k-loading-mask",
    ".k-loading-image",
    ".k-loading-color",
    "div[aria-busy='true']",
    "[role='dialog']",
    ".modal",
    ".modal-backdrop",
    ".spinner",
    ".loading",
  ];

  const deadline = Date.now() + timeoutMs;

  const isAnyVisible = async () => {
    return await page
      .evaluate((sels) => {
        const isVisible = (el: Element) => {
          const s = window.getComputedStyle(el as any);
          if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };

        return sels.some((sel) => {
          const el = document.querySelector(sel);
          return el ? isVisible(el) : false;
        });
      }, spinnerSelectors)
      .catch(() => false);
  };

  while (Date.now() < deadline) {
    const v1 = await isAnyVisible();
    if (!v1) {
      await page.waitForTimeout(250).catch(() => {});
      const v2 = await isAnyVisible();
      if (!v2) return;
    }
    await page.waitForTimeout(250).catch(() => {});
  }

  console.log("[Migdal] warning: loading overlay/spinner still visible after", timeoutMs, "ms");
}

/* =========================
   Login + OTP
========================= */

export async function migdalClickHereIfPresent(page: Page) {
  const sel = loginSelectors();

  const url = page.url();
  const isLogoutScreen = /my\.logout\.php/i.test(url) || /errorcode=\d+/i.test(url);
  if (!isLogoutScreen) return;

  await softNetworkIdle(page);

  const fr = (await findFrameWithSelector(page, sel.clickHere)) ?? page.mainFrame();
  const link = fr.locator(sel.clickHere).first();

  const exists = (await link.count().catch(() => 0)) > 0;
  if (!exists) return;

  await link.click({ timeout: 20_000 }).catch(async () => {
    await link.click({ timeout: 20_000, force: true }).catch(() => {});
  });

  await softNetworkIdle(page);
  console.log("[Migdal] clicked 'לחץ כאן' (if present), url:", page.url());
}

export async function migdalLogin(page: Page, username: string, password: string) {
  const sel = loginSelectors();

  await softNetworkIdle(page);
  await migdalClickHereIfPresent(page);

  const fr = (await findFrameWithSelector(page, sel.username)) ?? page.mainFrame();

  await fr.waitForSelector(sel.username, { state: "visible", timeout: 60_000 });
  await fr.fill(sel.username, username);

  await fr.waitForSelector(sel.password, { state: "visible", timeout: 60_000 });
  await fr.fill(sel.password, password);

  const submit = fr.locator(sel.submit).first();
  await submit.waitFor({ state: "visible", timeout: 30_000 });
  await waitUntilEnabled(submit, 60_000);

  await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), submit.click()]).catch(async () => {
    await submit.click().catch(() => {});
  });

  await softNetworkIdle(page);
  console.log("[Migdal] after login click url:", page.url());
}


export async function migdalHandleOtp(
  page: Page,
  context: BrowserContext,
  ctx: RunnerCtx
): Promise<Page> {
  const { runId, setStatus, pollOtp, clearOtp } = ctx;
  const sel = loginSelectors();

  await softNetworkIdle(page);

  const fr = (await findFrameWithSelector(page, sel.otp)) ?? page.mainFrame();
  const otpField = fr.locator(sel.otp).first();

  const otpVisible = await otpField.isVisible().catch(() => false);
  if (!otpVisible) {
    console.log("[Migdal] OTP not required");
    return page;
  }

  // ✅ החלטה לפי השדה בתוך ה-run (SaaS)
  const otpMode = String((ctx.run as any)?.otp?.mode || "firestore").toLowerCase();

  // =========================
  // MANUAL: הסוכן מזין בפורטל עצמו
  // =========================
  if (otpMode === "manual") {
    await setStatus(runId, {
      status: "otp_required",
      step: "migdal_otp_required_manual",
      otp: {
        mode: "manual",
        state: "required",
        hint: "🔐 ממתין להזנת קוד אימות בפורטל החברה...",
      },
    });

    console.log("[Migdal] OTP manual mode: waiting for user to complete OTP in portal...");

    // נחכה להתקדמות אמיתית אחרי OTP:
    // 1) מעבר לעולם NewEra
    // 2) הופעת goToHome
    // 3) שדה OTP נעלם / מוסתר
    await page.waitForFunction(() => {
      const url = location.href || "";
      if (/\/NewEra\//i.test(url)) return true;

      if (document.querySelector("#goToHome")) return true;

      const otp =
        document.querySelector('input[name="otp"]') ||
        document.querySelector('input.credentials_input_password[name="otp"]');

      if (!otp) return true;

      const s = window.getComputedStyle(otp as any);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return true;

      return false;
    }, { timeout: 180_000 });

    // גיבוי: אם בכל זאת “חזרנו” בגלל תנאי חלש, ננסה גם URL
    await page.waitForURL(/NewEra/i, { timeout: 60_000 }).catch(() => {});

    await softNetworkIdle(page);

    page = await pickActivePage(context, page);
    console.log("[Migdal] OTP manual completed; url:", page.url());

    // לא מנקים OTP ב-Firestore כי לא השתמשנו בו
    return page;
  }

  // =========================
  // FIRESTORE: ה-UI שלנו מזין קוד
  // =========================
  await setStatus(runId, {
    status: "otp_required",
    step: "migdal_otp_required",
    otp: { mode: "firestore", state: "required" },
  });

  console.log("[Migdal] otp visible -> waiting for otp from firestore...");
  const otp = await pollOtp(runId);
  console.log("[Migdal] got OTP");

  await otpField.fill(otp);
  await otpField.dispatchEvent("input").catch(() => {});
  await otpField.dispatchEvent("change").catch(() => {});
  await otpField.blur().catch(() => {});

  const submit = fr.locator(sel.submit).first();
  await submit.waitFor({ state: "visible", timeout: 30_000 });
  await waitUntilEnabled(submit, 120_000);

  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => {}),
    submit.click(),
  ]).catch(async () => {
    await submit.click().catch(() => {});
  });

  await softNetworkIdle(page);

  // ✅ מנקים רק במצב firestore
  await clearOtp(runId);

  page = await pickActivePage(context, page);
  console.log("[Migdal] OTP submitted; url:", page.url());
  return page;
}


export async function migdalEnsureArrived(page: Page) {
  await softNetworkIdle(page);

  if (/\/NewEra\/home/i.test(page.url())) {
    console.log("[Migdal] arrived OK by url:", page.url());
    return;
  }

  await page.waitForURL(/NewEra/i, { timeout: 90_000 }).catch(() => {});
  if (/\/NewEra/i.test(page.url())) {
    console.log("[Migdal] arrived OK by URL NewEra:", page.url());
    return;
  }

  const sel = loginSelectors();
  const fr = (await findFrameWithSelector(page, sel.arrived)) ?? page.mainFrame();
  const arrived = fr.locator(sel.arrived).first();
  await arrived.waitFor({ state: "visible", timeout: 90_000 });

  console.log("[Migdal] arrived OK (found #goToHome), url:", page.url());
}

/* =========================
   Navigation: Tools -> Reports
========================= */

export async function migdalGotoToolsAndReports(page: Page, context: BrowserContext): Promise<Page> {
  const newPagePromise = context.waitForEvent("page", { timeout: 5_000 }).catch(() => null);

  await page.getByText("כלים", { exact: true }).click({ timeout: 30_000 });
  await page.waitForTimeout(250).catch(() => {});
  await page.getByText("דוחות", { exact: true }).click({ timeout: 30_000 });

  const newPage = await newPagePromise;
  if (newPage) page = newPage;

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(500).catch(() => {});
  return page;
}

/* =========================
   Reports: search + open
========================= */

export async function migdalSearchAndOpenReportFromReports(page: Page, reportName: string): Promise<Page> {
  const inputBySelector = await locatorInAnyFrame(page, 'div.src-input-container input[type="text"]');
  const inputByPlaceholder = page.getByPlaceholder(/הקלד.*דוח.*לחיפוש/).first();

  const input = (await inputByPlaceholder.count().catch(() => 0)) > 0 ? inputByPlaceholder : inputBySelector.first();

  await input.waitFor({ state: "visible", timeout: 60_000 });
  await input.scrollIntoViewIfNeeded().catch(() => {});
  await input.click({ timeout: 10_000 }).catch(() => {});
  await input.fill(reportName, { timeout: 20_000 });

  const btn = page
    .locator('button.src-btn:has(img[src*="ic-src"])')
    .first()
    .or(page.locator("button.src-btn").first());

  await btn.waitFor({ state: "visible", timeout: 30_000 });
  await btn.click({ timeout: 30_000 });

  const item = page.locator("div.rslt-item-param-ttl", { hasText: reportName }).first();
  await item.waitFor({ state: "visible", timeout: 60_000 });
  await item.scrollIntoViewIfNeeded().catch(() => {});

  await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), item.click({ timeout: 30_000 })]).catch(
    async () => {
      const parent = item.locator("xpath=..").first();
      await parent.click({ timeout: 30_000, force: true }).catch(() => {});
    }
  );

  await softNetworkIdle(page);
  console.log("[Migdal] opened report from Reports search:", reportName);

  return page;
}

/* =========================
   Report loaded (stronger)
========================= */

export async function migdalWaitForReportLoaded(page: Page) {
  console.log("[Migdal] waitReportLoaded url:", page.url());

  await page.waitForFunction(() => {
    const hasTopPanel = !!document.querySelector("#top-panel");
    const hasPeriodsSelect = !!document.querySelector("select#periodsList");
    const hasKendoInput = !!document.querySelector("div.k-rtl.periodsList span.k-input");
    const hasExportNg = !!document.querySelector('a[ng-click="exportToExcel(false)"]');
    const hasGrid = !!document.querySelector("#kendoGridId");
    return hasTopPanel || hasPeriodsSelect || hasKendoInput || hasExportNg || hasGrid;
  }, { timeout: 120_000 });

  await page.waitForTimeout(300).catch(() => {});
  await migdalWaitNoLoading(page, 120_000).catch(() => {});
  console.log("[Migdal] waitReportLoaded OK ✅");
}

/* =========================
   ✅ Multi periods export (NEW)
========================= */

function ymToYmd(ym: string) {
  // "YYYY-MM" -> "YYYY-MM-01"
  const m = String(ym).trim();
  if (!/^\d{4}-\d{2}$/.test(m)) throw new Error(`Invalid ym: ${ym}`);
  return `${m}-01`;
}

// export async function migdalExportMultiPeriodsToCsv(
//   page: Page,
//   context: BrowserContext,
//   downloadDir: string,
//   params: { ym: string },
//   opts?: {
//     downloadTimeoutMs?: number;
//     minBytesLikelyData?: number;
//     settleMsBeforeClick?: number;
//     settleMsAfterDownload?: number;
//     debugDir?: string;
//     debugLabelPrefix?: string;
//   }
// ) {
//   await softNetworkIdle(page);

//   const rawDir = downloadDir || "./downloads";
//   const dir = path.isAbsolute(rawDir) ? rawDir : path.resolve(process.cwd(), rawDir);
//   fs.mkdirSync(dir, { recursive: true });

//   const ym = params.ym; // "YYYY-MM"
//   const year = ym.slice(0, 4);
//   const periodId = `cb-period-${ymToYmd(ym)}`; // cb-period-2026-01-01

//   const downloadTimeoutMs = opts?.downloadTimeoutMs ?? 180_000;
//   const minBytesLikelyData = opts?.minBytesLikelyData ?? 5_000;
//   const settleMsBeforeClick = opts?.settleMsBeforeClick ?? 250;
//   const settleMsAfterDownload = opts?.settleMsAfterDownload ?? 1500;

//   const debugDir = opts?.debugDir;
//   const debugLabelPrefix = opts?.debugLabelPrefix || "migdal_multi";

//   // 0) Locate and click "ייצוא למספר תקופות"
//   const exportMultiBtn = page
//     .locator("button", { hasText: "ייצוא למספר תקופות" })
//     .first()
//     .or(page.locator('span.item-label:has-text("ייצוא למספר תקופות")').first().locator("xpath=ancestor::button[1]"));

//   await exportMultiBtn.waitFor({ state: "visible", timeout: 60_000 });
//   await exportMultiBtn.scrollIntoViewIfNeeded().catch(() => {});
//   await migdalWaitNoLoading(page, 120_000).catch(() => {});
//   await page.waitForTimeout(settleMsBeforeClick).catch(() => {});

//   if (debugDir) {
//     await debugElementShot(exportMultiBtn, debugDir, `${debugLabelPrefix}__btn_export_multi`).catch(() => {});
//   }

//   await exportMultiBtn.click({ timeout: 30_000 }).catch(async () => {
//     await exportMultiBtn.click({ force: true, timeout: 30_000 }).catch(() => {});
//   });

//   // 1) Wait modal visible (title is h1.modal-title)
//   const modal = page.locator(".modal-content").first();
//   await modal.waitFor({ state: "visible", timeout: 30_000 });

//   const modalTitle = page.locator("h1.modal-title", { hasText: "ייצוא דוח למספר תקופות" }).first();
//   await modalTitle.waitFor({ state: "visible", timeout: 30_000 });

//   if (debugDir) {
//     await migdalDebugSnapshot({ page, dir: debugDir, label: `${debugLabelPrefix}__modal_open` }).catch(() => {});
//     await dumpOuterHTML(page, ".modal-content", debugDir, `${debugLabelPrefix}__modal_content_outerhtml`).catch(() => {});
//   }

//   // 2) Select Year via Kendo DropDownList
//   // The <select id="periodsYearsList"> is hidden; use wrapper click -> listbox li
//   const yearSelect = page.locator("#periodsYearsList").first();
//   await yearSelect.waitFor({ state: "attached", timeout: 30_000 });

//   const kendoWrap = page.locator("span.k-dropdown-wrap", { has: yearSelect }).first();
//   // לפעמים ה-wrap לא עטוף ישירות; fallback: לפי aria-owns
//   const kendoWrapFallback = page.locator('span.k-dropdown-wrap[aria-owns="periodsYearsList_listbox"]').first();

//   const wrap = (await kendoWrap.count().catch(() => 0)) > 0 ? kendoWrap : kendoWrapFallback;

//   await wrap.waitFor({ state: "visible", timeout: 30_000 });
//   await wrap.scrollIntoViewIfNeeded().catch(() => {});
//   await wrap.click({ timeout: 20_000 }).catch(async () => {
//     await wrap.click({ force: true, timeout: 20_000 }).catch(() => {});
//   });

//   const listbox = page.locator("#periodsYearsList_listbox").first();
//   await listbox.waitFor({ state: "visible", timeout: 30_000 });

//   const yearItem = listbox.locator("li.k-item", { hasText: year }).first();
//   await yearItem.waitFor({ state: "visible", timeout: 30_000 });
//   await yearItem.click({ timeout: 20_000 }).catch(async () => {
//     await yearItem.click({ force: true, timeout: 20_000 }).catch(() => {});
//   });

//   // tiny settle
//   await page.waitForTimeout(300).catch(() => {});

//   if (debugDir) {
//     await migdalDebugSnapshot({ page, dir: debugDir, label: `${debugLabelPrefix}__after_year_${year}` }).catch(() => {});
//   }

//   // 3) Pick month checkbox
//   // input id="cb-period-2026-01-01"
//   const cb = page.locator(`#${periodId}`).first();
//   await cb.waitFor({ state: "attached", timeout: 30_000 });

//   // try click label first (more reliable for styled checkboxes)
//   const cbLabel = page.locator(`label[for="${periodId}"]`).first();
//   if ((await cbLabel.count().catch(() => 0)) > 0) {
//     await cbLabel.scrollIntoViewIfNeeded().catch(() => {});
//     await cbLabel.click({ timeout: 20_000 }).catch(async () => {
//       await cbLabel.click({ force: true, timeout: 20_000 }).catch(() => {});
//     });
//   } else {
//     await cb.scrollIntoViewIfNeeded().catch(() => {});
//     await cb.check({ timeout: 20_000 }).catch(async () => {
//       await cb.click({ force: true, timeout: 20_000 }).catch(() => {});
//     });
//   }

//   // Ensure checked
//   const checkedOk = await cb.isChecked().catch(() => false);
//   if (!checkedOk) {
//     // one more attempt
//     await cb.click({ force: true, timeout: 20_000 }).catch(() => {});
//   }

//   await page.waitForTimeout(250).catch(() => {});

//   if (debugDir) {
//     await migdalDebugSnapshot({ page, dir: debugDir, label: `${debugLabelPrefix}__after_check_${ym}` }).catch(() => {});
//   }

//   // 4) Click "סיום" (button ng-click="ExportMultiPeriodsToCsv()")
//   const finishBtn = page.locator('button[ng-click="ExportMultiPeriodsToCsv()"]').first();

//   await finishBtn.waitFor({ state: "visible", timeout: 30_000 });
//   await finishBtn.scrollIntoViewIfNeeded().catch(() => {});

//   // wait until not disabled
//   await page
//     .waitForFunction(() => {
//       const btn = document.querySelector('button[ng-click="ExportMultiPeriodsToCsv()"]') as HTMLButtonElement | null;
//       if (!btn) return false;
//       return !btn.disabled;
//     }, { timeout: 30_000 })
//     .catch(() => {});

//   if (debugDir) {
//     await debugElementShot(finishBtn, debugDir, `${debugLabelPrefix}__btn_finish`).catch(() => {});
//     await dumpOuterHTML(page, 'button[ng-click="ExportMultiPeriodsToCsv()"]', debugDir, `${debugLabelPrefix}__finish_outerhtml`).catch(() => {});
//   }

//   // 5) Download / response race (same approach as ExportExcel)
//   page.once("dialog", async (d) => {
//     console.log("[Migdal][MULTI] dialog:", d.type(), d.message());
//     await d.accept().catch(() => {});
//   });

//   let bestPath = "";
//   let bestSize = 0;

//   const maxAttempts = 2;

//   for (let attempt = 1; attempt <= maxAttempts; attempt++) {
//     await migdalWaitNoLoading(page, 120_000).catch(() => {});
//     await page.waitForTimeout(200).catch(() => {});

//     const pDlPage = page.waitForEvent("download", { timeout: downloadTimeoutMs }).catch(() => null);
//     const pPopup = page.waitForEvent("popup", { timeout: 7_000 }).catch(() => null);
//     const pNewPage = context.waitForEvent("page", { timeout: 7_000 }).catch(() => null);

//     const pResp = page
//       .waitForResponse((r) => {
//         const h = r.headers();
//         const cd = (h["content-disposition"] || "").toLowerCase();
//         const ct = (h["content-type"] || "").toLowerCase();
//         if (cd.includes("attachment")) return true;
//         if (ct.includes("zip") || ct.includes("csv") || ct.includes("excel") || ct.includes("spreadsheetml")) return true;
//         const u = r.url().toLowerCase();
//         if (u.includes("export") || u.includes("csv") || u.includes("excel")) return true;
//         return false;
//       }, { timeout: downloadTimeoutMs })
//       .catch(() => null);

//     await finishBtn.click({ timeout: 30_000 }).catch(async () => {
//       await finishBtn.click({ force: true, timeout: 30_000 }).catch(() => {});
//     });

//     const popup = await pPopup;
//     const newPage = await pNewPage;

//     const pDlFromPopup = popup ? popup.waitForEvent("download", { timeout: downloadTimeoutMs }).catch(() => null) : Promise.resolve(null);
//     const pDlFromNewPage = newPage ? newPage.waitForEvent("download", { timeout: downloadTimeoutMs }).catch(() => null) : Promise.resolve(null);

//     const winner = await Promise.race([pDlPage, pDlFromPopup, pDlFromNewPage, pResp]);

//     let savedPath = "";
//     let size = 0;
//     let okLikelyHasData = false;

//     if (winner && typeof (winner as any).saveAs === "function") {
//       const dl = winner as Download;
//       savedPath = await saveDownload(dl, dir, attempt);
//       await page.waitForTimeout(settleMsAfterDownload).catch(() => {});
//       size = fileSizeSafe(savedPath);
//       okLikelyHasData = size >= minBytesLikelyData;
//       console.log("[Migdal][MULTI] got DOWNLOAD ✅", { savedPath, bytes: size, attempt });
//     } else if (winner && typeof (winner as any).url === "function" && typeof (winner as any).body === "function") {
//       const resp = winner as Response;
//       const saved = await saveResponseBodyToFile(resp, dir, attempt);
//       savedPath = saved.filePath;
//       size = saved.bytes;
//       okLikelyHasData = size >= minBytesLikelyData;
//       console.log("[Migdal][MULTI] got RESPONSE ✅", { url: resp.url(), bytes: size, ct: saved.ct, cd: saved.cd, savedPath, attempt });
//     } else {
//       // אם אין download/response — לפעמים המודל נשאר פתוח עם spinner; נצלם וננסה שוב
//       if (debugDir) {
//         await migdalDebugSnapshot({ page, dir: debugDir, label: `${debugLabelPrefix}__no_download_attempt_${attempt}` }).catch(() => {});
//       }
//       if (attempt === maxAttempts) {
//         throw new Error("Export multi-period click did not trigger download/response and no file appeared in downloads dir");
//       }
//       await page.waitForTimeout(1200).catch(() => {});
//       continue;
//     }

//     if (size > bestSize) {
//       bestSize = size;
//       bestPath = savedPath;
//     }

//     if (okLikelyHasData) {
//       return { savedPath, attempts: attempt, okLikelyHasData: true };
//     }

//     // קטן מדי -> נסיון נוסף
//     if (attempt < maxAttempts) {
//       console.log("[Migdal][MULTI] warning: file seems too small, will retry.", { size, minBytesLikelyData, attempt });
//       await page.waitForTimeout(1500).catch(() => {});
//       continue;
//     }

//     return { savedPath: bestPath || savedPath, attempts: attempt, okLikelyHasData: false };
//   }

//   return { savedPath: bestPath, attempts: maxAttempts, okLikelyHasData: bestSize >= minBytesLikelyData };
// }

export async function migdalExportExcelSimple(
  page: Page,
  context: BrowserContext,
  downloadDir: string
): Promise<{ download: Download; savedPath: string; filename: string }> {
  const dir = path.isAbsolute(downloadDir) ? downloadDir : path.resolve(process.cwd(), downloadDir);
  fs.mkdirSync(dir, { recursive: true });

  // <a role="button" ng-click="exportToExcel(false)"> ... <span class="item-label">ייצוא לאקסל</span>
  const exportBtn = page.locator('a[role="button"][ng-click="exportToExcel(false)"]').first();

  await exportBtn.waitFor({ state: "visible", timeout: 60_000 });
  await exportBtn.scrollIntoViewIfNeeded().catch(() => {});

  // לפעמים הכפתור "מנוטרל" ע"י class link-disabled
  await page.waitForFunction(() => {
    const el = document.querySelector('a[role="button"][ng-click="exportToExcel(false)"]');
    if (!el) return false;
    return !(el.getAttribute("class") || "").includes("link-disabled");
  }, { timeout: 60_000 }).catch(() => {});

  // ✅ הורדה קלאסית
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    exportBtn.click(),
  ]);

  const filename = download.suggestedFilename() || `migdal_export_${Date.now()}.xlsx`;
  const savedPath = path.join(dir, `${Date.now()}_${filename}`);
  await download.saveAs(savedPath);

  return { download, savedPath, filename };
}


/* =========================
   ✅ Migdal ZIP→CSV validation
========================= */

export async function migdalValidateZipCsvHasRows(zipPath: string, minDataRows = 1) {
  const buf = await fs.promises.readFile(zipPath);

  const head = buf.subarray(0, 300).toString("utf8").toLowerCase();
  if (head.includes("<!doctype html") || head.includes("<html") || head.includes("sessionexpired")) {
    throw new Error("Migdal export is HTML (SessionExpired) - not a ZIP with CSV");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (e: any) {
    throw new Error(`Migdal export is not a valid ZIP: ${e?.message || e}`);
  }

  const csvName = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".csv"));
  if (!csvName) {
    throw new Error("Migdal ZIP does not contain a CSV file");
  }

  const csvText = await zip.file(csvName)!.async("text");
  const rows = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const dataRows = rows.slice(1);
  if (dataRows.length < minDataRows) {
    throw new Error(`Migdal CSV has headers only (rows=${rows.length}, dataRows=${dataRows.length})`);
  }

  console.log("[Migdal] ZIP→CSV validated ✅", { csvName, rows: rows.length, dataRows: dataRows.length });
}
