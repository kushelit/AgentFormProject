// scripts/portalRunner/src/providers/clal/clal.shared.ts
import type { Page, Download, Locator } from "playwright";
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

export async function openReportFromSummaryByName(page: Page, linkText: string) {
  const link = page
    .locator(".ui-grid-cell-contents a.ng-binding, .ui-grid-cell-contents a", { hasText: linkText })
    .first();

  await link.scrollIntoViewIfNeeded().catch(() => {});
  await link.waitFor({ state: "visible", timeout: 30_000 });
  await link.click();

  await softNetworkIdle(page);
  console.log("[Clal] clicked report link:", linkText);
}

/**
 * לחיצה על טאבים בתוך דוח (למשל: "עמיתים", "פוליסה")
 * חשוב: התאמה מדויקת כדי ש"פוליסה" לא יתפוס "סוכנים בפוליסה"
 */
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function clickReportTabHeading(page: Page, headingText: string) {
  const exact = new RegExp(`^\\s*${escapeRegExp(headingText)}\\s*$`);

  const tabHeading = page.locator("tab-heading").filter({ hasText: exact }).first();
  const tabAnchor = tabHeading.locator("xpath=ancestor::a[1]");

  const count = await tabAnchor.count().catch(() => 0);
  if (count > 0) {
    await tabAnchor.scrollIntoViewIfNeeded().catch(() => {});
    await tabAnchor.waitFor({ state: "visible", timeout: 30_000 });
    await tabAnchor.click();
    await waitAngularTick(page, 400);
    console.log("[Clal] clicked tab heading (exact):", headingText);
    return;
  }

  // fallback: גם פה exact
  const alt = page.locator("a").filter({ hasText: exact }).first();
  await alt.scrollIntoViewIfNeeded().catch(() => {});
  await alt.waitFor({ state: "visible", timeout: 30_000 });
  await alt.click();
  await waitAngularTick(page, 400);
  console.log("[Clal] clicked tab (fallback exact):", headingText);
}

export async function clalLogin(page: Page, username: string, password: string) {
  await page.waitForSelector("#input_1", { state: "visible", timeout: 30_000 });
  await page.fill("#input_1", username);
  await page.fill("#input_2", password);

  await Promise.all([page.waitForLoadState("domcontentloaded"), page.click("#btLogin_ctl09")]);
  console.log("[Clal] after login url:", page.url());
}

/**
 * OTP:
 * - manual: הסוכן מקליד בפורטל
 * - firestore: ה-UI שלנו שומר otp.value במסמך הריצה
 */
export async function clalHandleOtp(page: Page, ctx: RunnerCtx) {
  const { runId, setStatus, pollOtp, clearOtp } = ctx;

  const otpMode = String((ctx.run as any)?.otp?.mode || "firestore").toLowerCase();
  const tokenSel = 'input[name="Token"]';

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
  // MANUAL MODE
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

    await page.waitForFunction(
      () => {
        const logout = Array.from(document.querySelectorAll("*")).find(
          (el) => (el as HTMLElement)?.innerText?.trim() === "התנתק"
        );
        if (logout) return true;

        const token = document.querySelector('input[name="Token"]') as HTMLInputElement | null;
        if (!token) return true;

        const s = window.getComputedStyle(token);
        if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return true;

        return false;
      },
      { timeout: 180_000 }
    );

    await softNetworkIdle(page);

    const ok = await page.getByText("התנתק").first().isVisible().catch(() => false);
    console.log(ok ? "[Clal] logged in (found התנתק)" : "[Clal] progressed after manual OTP");

    await setStatus(runId, { status: "logged_in", step: "clal_logged_in" });
    return;
  }

  // ==========================
  // FIRESTORE MODE
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
    await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), btn.click()]);
  } else {
    const submit = page.getByRole("button", { name: /המשך|אישור|כניסה|שלח/i }).first();
    await Promise.all([page.waitForLoadState("domcontentloaded").catch(() => {}), submit.click()]);
  }

  await softNetworkIdle(page);
  console.log("[Clal] after otp url:", page.url());

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
  const [newPage] = await Promise.all([ctx.waitForEvent("page", { timeout: 30_000 }).catch(() => null), link.click()]);

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
 * Search בלבד:
 * - לא משנים חודש בכלל
 * - כן לוחצים "חפש"
 */
export async function selectMonthAndSearch(page: Page, _monthLabelForLogsOnly?: string) {
  await page.waitForSelector('select[ng-model="selectedMonth"]', { state: "visible", timeout: 30_000 });

  const searchBtn = page.locator('button[ng-click="search()"]').first();
  await searchBtn.waitFor({ state: "visible", timeout: 30_000 });
  await searchBtn.click();

  await softNetworkIdle(page);
  console.log("[Clal] search clicked (month unchanged).");
}

/**
 * לוודא שהטבלה התמלאה אחרי Search:
 * - או שיש לפחות שורה אחת ב-ui-grid
 * - או שמופיע טקסט "אין נתונים" (אם יש כזה)
 *
 * אם תרצי, נעדכן את הסלקטורים לפי צילום מסך אמיתי של ה-grid.
 */
export async function waitForCommissionsGridFilled(page: Page, timeoutMs = 60_000) {
  const rows = page.locator(".ui-grid-row");
  const noData = page.locator(".ui-grid-empty, .ui-grid-no-row-overlay, text=/אין נתונים|לא נמצאו נתונים/i");

  await Promise.race([
    rows.first().waitFor({ state: "visible", timeout: timeoutMs }).then(() => "rows").catch(() => null),
    noData.first().waitFor({ state: "visible", timeout: timeoutMs }).then(() => "empty").catch(() => null),
  ]);

  // לא זורקים פה שגיאה — אם לא מצאנו, לפחות לא נתקעים
  console.log("[Clal] grid wait done (rows or empty overlay).");
}

/**
 * ייצוא לאקסל (תוקן כדי לא להיתקע על כפתור שקיים אבל hidden)
 */
function exportLocatorCandidates(page: Page): Locator[] {
  return [
    page.locator('a.export-btn[ng-click*="downloadExcel"]:visible').first(),
    page.locator("a.export-btn:visible").first(),
    page.getByRole("link", { name: /יצא לאקסל/i }).first(),
    page.getByText(/יצא לאקסל/i).first(),
  ];
}

async function pickVisibleExportButton(page: Page, timeoutMs: number): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const cand of exportLocatorCandidates(page)) {
      const ok = await cand.isVisible().catch(() => false);
      if (!ok) continue;

      const ariaDisabled = await cand.getAttribute("aria-disabled").catch(() => null);
      const className = (await cand.getAttribute("class").catch(() => "")) || "";
      if (ariaDisabled === "true" || /disabled/i.test(className)) continue;

      return cand;
    }

    await waitAngularTick(page, 250);
  }

  throw new Error('Export button not visible (יצא לאקסל) within timeout');
}

/**
 * ייצוא לאקסל
 */
export async function exportExcelFromCurrentReport(page: Page): Promise<{ download: Download; filename: string }> {
  await waitAngularTick(page, 250);

  const exportBtn = await pickVisibleExportButton(page, 60_000);
  await exportBtn.scrollIntoViewIfNeeded().catch(() => {});
  await exportBtn.waitFor({ state: "visible", timeout: 30_000 });

  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), exportBtn.click()]);

  const filename = download.suggestedFilename();
  console.log("[Clal] export download started:", filename);
  return { download, filename };
}