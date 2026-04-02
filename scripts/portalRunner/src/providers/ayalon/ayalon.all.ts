import fs from "fs";
import path from "path";
import { chromium, Page, BrowserContext } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";
import {
  ayalonLogin,
  ayalonHandleOtp,
  ayalonDismissPopupQuick,
  ayalonDumpArtifacts,
  ayalonNavigateToReport,
  ayalonOpenReportTab,
  ayalonFilterDate,
  ayalonExportExcel,
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

function getPrevMonthLabel(): string {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const mm = String(prev.getMonth() + 1).padStart(2, "0");
  const yyyy = prev.getFullYear();
  return `01/${mm}/${yyyy}`;
}

export async function runAyalonAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage } = ctx;

  const portalUrl = "https://portal.ayalon-ins.co.il/";
  const absDir = s(paths?.downloadsDir || "./downloads");
  ensureDir(absDir);

  const monthLabel = (run.resolvedWindow?.kind === "month"
    ? (run.resolvedWindow.label || run.monthLabel)
    : run.resolvedWindow?.label) || "חודש נוכחי";

  const agentId = s((run as any)?.agentId || ctx.agentId);
  const { username, password } = await getAyalonCreds(ctx);
  const prevMonth = getPrevMonthLabel();
  console.log("[Ayalon] Target month:", prevMonth);

  await setStatus(runId, { status: "running", step: "ayalon_open_portal", monthLabel });

  const isExe = !!(process as any).pkg;
  const standardPath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const x86Path = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
  const localChromePath = fs.existsSync(standardPath)
    ? standardPath
    : fs.existsSync(x86Path) ? x86Path : null;
  const executablePath = isExe && localChromePath ? localChromePath : resolveChromiumExePath();

  const userDataDir = path.join(
    String(process.env.APPDATA || ""),
    "MagicSaleRunner",
    "chromium-profile-ayalon"
  );

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

  try {
    console.log("[Ayalon] Navigating to portal...");
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    await setStatus(runId, { status: "running", step: "מבצע לוגין לאיילון", monthLabel });
    await ayalonLogin(page, username, password);
    await page.waitForTimeout(4000);

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

    const allPages = context.pages();
    if (allPages.length > 1) {
      page = allPages[allPages.length - 1];
      await page.bringToFront();
      await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }

    await ayalonDismissPopupQuick(page);
    await page.waitForTimeout(2000);

    // ✅ נווט לדף הדוחות וחפש
    await setStatus(runId, { status: "running", step: "מנסה לנווט לדוחות", monthLabel });
    await ayalonNavigateToReport(page);
    await page.waitForTimeout(3000);

    // ✅ פתח את הדוח בטאב חדש
    await setStatus(runId, { status: "running", step: "פותח דוח נפרעים", monthLabel });
    const reportPage = await ayalonOpenReportTab(page, context);
    await page.waitForTimeout(10000);

    // ✅ סנן לפי חודש
    await setStatus(runId, { status: "running", step: `מסנן לחודש ${prevMonth}`, monthLabel });
    await ayalonFilterDate(reportPage, prevMonth);

    // ✅ ייצא לאקסל
    await setStatus(runId, { status: "running", step: "מייצא לאקסל", monthLabel });
    const download = await ayalonExportExcel(reportPage);

    if (download) {
      const filename = download.suggestedFilename();
      const localPath = path.join(absDir, `${Date.now()}_${filename}`);
      await download.saveAs(localPath);
      console.log("[Ayalon] Saved:", localPath);

      const up = await uploadLocalFileToStorageClient({
        storage,
        localPath,
        agentId,
        runId,
        subdir: "ayalon_insurance",
      } as any);

      if (up?.storagePath) {
        const downloads = [{
          templateId: "ayalon_insurance",
          localPath,
          filename: up.filename || filename,
          storagePath: up.storagePath,
        }];
        await setStatus(runId, { downloads, status: "done", step: "ayalon_done", monthLabel });
      }
    }

  } catch (e: any) {
    console.error("[Ayalon] Error:", e?.message || e);
    try { await ayalonDumpArtifacts(page, absDir, "error_state"); } catch {}
    await setStatus(runId, { status: "error", error: e?.message || String(e), monthLabel });
    throw e;
  } finally {
    await context.close().catch(() => {});
  }
}