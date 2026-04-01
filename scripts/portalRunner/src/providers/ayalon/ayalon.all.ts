import fs from "fs";
import path from "path";
import { chromium, Page } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import {
  ayalonLogin,
  ayalonHandleOtp,
  ayalonDismissPopupQuick,
  ayalonDumpArtifacts,
  ayalonNavigateToReport,  // ✅ מיובא מ-shared
} from "./ayalon.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function s(v: any) {
  return String(v ?? "").trim();
}

async function getAyalonCreds(ctx: RunnerCtx) {
  const functions = (ctx as any).functions;
  if (!functions) throw new Error("Missing ctx.functions");
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId: "ayalon" });
  return {
    username: s(res?.data?.username),
    password: s(res?.data?.password),
  };
}

async function diagnosePage(page: Page, tag: string) {
  console.log(`[Ayalon] === DIAG: ${tag} ===`);
  console.log("[Ayalon] url:", page.url());
  console.log("[Ayalon] title:", await page.title().catch(() => "FAILED"));
  console.log("[Ayalon] frames:", page.frames().length);
  for (const fr of page.frames()) {
    console.log("[Ayalon] frame url:", fr.url());
  }
  const bodyCount = await page.locator("body").count().catch(() => 0);
  const inputCount = await page.locator("input").count().catch(() => 0);
  const linkCount = await page.locator("a").count().catch(() => 0);
  const searchboxCount = await page.locator("#searchbox").count().catch(() => 0);
  console.log(`[Ayalon] body:${bodyCount} inputs:${inputCount} links:${linkCount} searchbox:${searchboxCount}`);
}

// ✅ הפונקציה הישנה נמחקה — מגיעה מ-shared

export async function runAyalonAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths } = ctx;

  const portalUrl = "https://portal.ayalon-ins.co.il/";
  const absDir = s(paths?.downloadsDir || "./downloads");
  ensureDir(absDir);

  const monthLabel =
    (run.resolvedWindow?.kind === "month"
      ? (run.resolvedWindow.label || run.monthLabel)
      : run.resolvedWindow?.label) || "חודש נוכחי";

  const { username, password } = await getAyalonCreds(ctx);

  await setStatus(runId, { status: "running", step: "ayalon_open_portal", monthLabel });

  const isExe = !!(process as any).pkg;
  const standardPath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const x86Path = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
  const localChromePath = fs.existsSync(standardPath)
    ? standardPath
    : fs.existsSync(x86Path)
      ? x86Path
      : null;
  const executablePath = isExe && localChromePath ? localChromePath : resolveChromiumExePath();

  const userDataDir = path.join(
    String(process.env.APPDATA || ""),
    "MagicSaleRunner",
    "chromium-profile-ayalon"
  );
  console.log("[Ayalon] userDataDir:", userDataDir);
  console.log("[Ayalon] executablePath:", executablePath ?? "default (Chromium)");

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: executablePath || undefined,
    viewport: null,
    acceptDownloads: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--start-maximized"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  let page = context.pages()[0] || await context.newPage();
  await page.bringToFront();

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      console.log("[Ayalon] navigated to:", page.url());
    }
  });

  context.on("page", async (newPage) => {
    console.log("[Ayalon] NEW PAGE opened:", newPage.url());
  });

  try {
    console.log("[Ayalon] Navigating to portal...");
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await diagnosePage(page, "after_goto");

    await setStatus(runId, { status: "running", step: "מבצע לוגין לאיילון", monthLabel });
    await ayalonLogin(page, username, password);
    await page.waitForTimeout(4000);
    await diagnosePage(page, "after_login");

    await setStatus(runId, {
      status: "otp_required",
      step: "ממתין לקוד אימות (SMS) מחברת איילון",
      "otp.mode": "firestore",
      monthLabel,
    });

    await ayalonHandleOtp(page, ctx);

    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await diagnosePage(page, "after_otp");

    const allPages = context.pages();
    console.log("[Ayalon] total pages after OTP:", allPages.length);
    if (allPages.length > 1) {
      page = allPages[allPages.length - 1];
      console.log("[Ayalon] Switching to newest page:", page.url());
      await page.bringToFront();
      await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await diagnosePage(page, "after_switch");
    }

    await setStatus(runId, { status: "running", step: "מייצב דף בית", monthLabel });
    await ayalonDismissPopupQuick(page);
    await page.waitForTimeout(2000);

    await ayalonDumpArtifacts(page, absDir, "before_navigate");
    await diagnosePage(page, "before_navigate");

    await setStatus(runId, { status: "running", step: "מנסה לנווט לדוחות", monthLabel });
    await ayalonNavigateToReport(page);  // ✅ מ-shared עם CDP

    await setStatus(runId, { status: "done", step: "הדוח אותר בהצלחה", monthLabel });

  } catch (e: any) {
    console.error("[Ayalon] Error:", e?.message || e);
    try {
      await ayalonDumpArtifacts(page, absDir, "error_state");
    } catch {}
    await setStatus(runId, { status: "error", error: e?.message || String(e), monthLabel });
    throw e;
  } finally {
    await context.close().catch(() => {});
  }
}