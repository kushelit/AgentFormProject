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

export async function clalLogin(page: Page, username: string, password: string) {
  await page.waitForSelector("#input_1", { state: "visible", timeout: 30_000 });
  await page.fill("#input_1", username);
  await page.fill("#input_2", password);

  await Promise.all([page.waitForLoadState("domcontentloaded"), page.click("#btLogin_ctl09")]);
  console.log("[Clal] after login url:", page.url());
}

/**
 * OTP: ה-runner מחכה שתזיני otp.value ב-Firestore למסמך הריצה.
/**
 * OTP: או מה-UI שלנו (Firestore) או ידני בפורטל (manual).
 * קבעי דרך ENV: OTP_MODE=manual | firestore  (ברירת מחדל firestore)
 */
export async function clalHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp } = ctx;

  // ✅ SaaS: mode בתוך ה-run (לא ENV)
  const otpMode = String((ctx.run as any)?.otp?.mode || "firestore").toLowerCase();

  const tokenSel = 'input[name="Token"]';

  // נוודא שיש בכלל מסך OTP
  const tokenVisible = await page
    .locator(tokenSel)
    .first()
    .isVisible()
    .catch(() => false);

  if (!tokenVisible) {
    console.log("[Clal] OTP not required");
    return;
  }

  // ==========================
  // ✅ MANUAL MODE (הסוכן מזין בפורטל)
  // ==========================
  if (otpMode === "manual") {
    await setStatus(runId, {
      status: "otp_required",
      step: "clal_otp_required_manual",
      otp: {
        mode: "manual",
        state: "required",
        hint: "🔐 ממתין להזנת קוד אימות בפורטל החברה...",
      },
    });

    console.log("[Clal] OTP manual mode: waiting for user to complete OTP in portal...");

    // נחכה להתקדמות אמיתית: "התנתק" או שדה Token נעלם/מוסתר
    await page.waitForFunction(() => {
      // 1) אם יש "התנתק" - כניסה הצליחה
      const logout = Array.from(document.querySelectorAll("*")).find(
        (el) => (el as HTMLElement)?.innerText?.trim() === "התנתק"
      );
      if (logout) return true;

      // 2) אם שדה Token נעלם/מוסתר
      const token = document.querySelector('input[name="Token"]') as HTMLInputElement | null;
      if (!token) return true;

      const s = window.getComputedStyle(token);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return true;

      return false;
    }, { timeout: 180_000 });

    await softNetworkIdle(page);

    const ok = await page.getByText("התנתק").first().isVisible().catch(() => false);
    console.log(ok ? "[Clal] logged in (found התנתק)" : "[Clal] progressed after manual OTP");

    await setStatus(runId, { status: "logged_in", step: "clal_logged_in" });

    // ✅ לא מנקים OTP כי לא השתמשנו ב-Firestore
    return;
  }

  // ==========================
  // ✅ FIRESTORE MODE (ה-UI שלנו שולח OTP)
  // ==========================
  await setStatus(runId, {
    status: "otp_required",
    step: "clal_otp_required",
    otp: { mode: "firestore", state: "required" },
  });

  const otp = await pollOtp(runId);
  console.log("[Clal] got OTP");

  await page.waitForSelector(tokenSel, { state: "visible", timeout: 30_000 });
  await page.fill(tokenSel, otp);

  const btn = page.locator("#btLogin_ctl09");
  if (await btn.count().catch(() => 0)) {
    await Promise.all([
      page.waitForLoadState("domcontentloaded").catch(() => {}),
      btn.click(),
    ]);
  } else {
    const submit = page.getByRole("button", { name: /המשך|אישור|כניסה|שלח/i }).first();
    await Promise.all([
      page.waitForLoadState("domcontentloaded").catch(() => {}),
      submit.click(),
    ]);
  }

  await softNetworkIdle(page);
  console.log("[Clal] after otp url:", page.url());

  // ✅ מנקים רק במצב firestore
  await clearOtp(runId);

  const ok = await page.getByText("התנתק").first().isVisible().catch(() => false);
  console.log(ok ? "[Clal] logged in (found התנתק)" : "[Clal] logged in (logout not found yet)");

  await setStatus(runId, { status: "logged_in", step: "clal_logged_in" });
}

/**
 * מעבר למסך "פירוט עמלות" — לרוב זה target=_blank ולכן נפתח טאב חדש.
 */
export async function gotoCommissionsPage(page: Page): Promise<Page> {
  const link = page.locator('a[href="../commissions"]').first();
  await link.scrollIntoViewIfNeeded().catch(() => {});
  await link.waitFor({ state: "visible", timeout: 30_000 });

  const ctx = page.context();
  const [newPage] = await Promise.all([
    ctx.waitForEvent("page", { timeout: 30_000 }).catch(() => null),
    link.click(),
  ]);

  const commissionsPage = newPage ?? page;
  await commissionsPage.bringToFront().catch(() => {});
  await softNetworkIdle(commissionsPage);

  console.log("[Clal] commissions url:", commissionsPage.url());
  return commissionsPage;
}

/**
 * דרופדאון סוכנים -> "בחר הכל"
 */
export async function openAgentsDropdownAndSelectAll(page: Page) {
  await page.waitForSelector("#drpAgentsNameBtn", { state: "visible", timeout: 30_000 });
  await page.click("#drpAgentsNameBtn");

  const selectAllBtn = page.getByRole("button", { name: /בחר הכל/ }).first();
  await selectAllBtn.waitFor({ state: "visible", timeout: 30_000 });
  await selectAllBtn.click();

  await page.keyboard.press("Escape").catch(() => {});
  console.log("[Clal] agents: select all");
}

/**
 * בחירת חודש + חפש
 */
export async function selectMonthAndSearch(page: Page, monthLabel: string) {
  await page.waitForSelector('select[ng-model="selectedMonth"]', { state: "visible", timeout: 30_000 });
  await page.selectOption('select[ng-model="selectedMonth"]', { label: monthLabel });

  const searchBtn = page.locator('button[ng-click="search()"]').first();
  await searchBtn.waitFor({ state: "visible", timeout: 30_000 });
  await searchBtn.click();

  await softNetworkIdle(page);
  console.log("[Clal] search clicked for month:", monthLabel);
}

/**
 * לוודא שהטבלה התרעננה עם החודש שנבחר
 */
export async function waitForMonthHeader(page: Page, monthLabel: string) {
  const header = page
    .locator(".ui-grid-header-cell-label, [id*='uiGrid'][id*='header-text']")
    .filter({ hasText: monthLabel })
    .first();

  await header.waitFor({ state: "visible", timeout: 30_000 });
  console.log("[Clal] month header visible:", monthLabel);
}

/**
 * פתיחת דוח בריאות מתוך טבלת הסיכום (הקישור "בריאות")
 */
export async function openBriutReportFromSummary(page: Page) {
  const briutLink = page.locator(".ui-grid-cell-contents a", { hasText: "בריאות" }).first();
  await briutLink.scrollIntoViewIfNeeded().catch(() => {});
  await briutLink.waitFor({ state: "visible", timeout: 30_000 });
  await briutLink.click();

  await softNetworkIdle(page);
  console.log("[Clal] clicked briut link");
}

/**
 * ייצוא לאקסל
 */
export async function exportExcelFromCurrentReport(
  page: Page
): Promise<{ download: Download; filename: string }> {
  const exportLink = page.locator('a.export-btn[ng-click^="downloadExcel"]').first();

  await exportLink.waitFor({ state: "visible", timeout: 60_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    exportLink.click(),
  ]);

  const filename = download.suggestedFilename();
  return { download, filename };
}
