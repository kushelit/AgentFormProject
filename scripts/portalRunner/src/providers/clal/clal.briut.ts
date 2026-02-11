// scripts/portalRunner/src/providers/clal/clal.briut.ts
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { getPortalCreds } from "../../portalCredentials"; // ✅ חדש
import {
  envBool,
  clalLogin,
  clalHandleOtp,
  gotoCommissionsPage,
  openAgentsDropdownAndSelectAll,
  selectMonthAndSearch,
  waitForMonthHeader,
  openBriutReportFromSummary,
  exportExcelFromCurrentReport,
} from "./clal.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export async function runClalBriut(ctx: RunnerCtx) {
  const { runId, setStatus, env, admin, run } = ctx;

  const portalUrl = env.CLAL_PORTAL_URL || "https://www.clalnet.co.il/";
  // const headless = envBool(env.HEADLESS, false);
  const headless = false;

  // ✅ קרדנצ'לים מה-Firestore (מוצפן) במקום ENV
  const agentId = String((run as any)?.agentId || "").trim();
  if (!agentId) throw new Error("Missing run.agentId (required to load portal credentials)");

  const { username, password } = await getPortalCreds({
    agentId,
    portalId: "clal",
  });

  // חודש לתצוגה בפורטל
  const resolvedLabel =
    run.resolvedWindow?.kind === "month"
      ? (run.resolvedWindow.label || run.monthLabel)
      : run.resolvedWindow?.label;

  const monthLabel = resolvedLabel || env.CLAL_TEST_MONTH_LABEL || "נובמבר 2025";
  const downloadDir = env.DOWNLOAD_DIR || "downloads";

  await setStatus(runId, { status: "running", step: "clal_open_portal", monthLabel });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  await page.goto(portalUrl, { waitUntil: "domcontentloaded" });

  // Login + OTP
  await setStatus(runId, { status: "running", step: "clal_login", monthLabel });
  await clalLogin(page, username, password);

  await setStatus(runId, { status: "running", step: "clal_otp", monthLabel });
  await clalHandleOtp(page, ctx);

  // עמלות
  await setStatus(runId, { status: "running", step: "clal_goto_commissions", monthLabel });
  const commissionsPage = await gotoCommissionsPage(page);

  await setStatus(runId, { status: "running", step: "clal_select_all_agents", monthLabel });
  await openAgentsDropdownAndSelectAll(commissionsPage);

  await setStatus(runId, { status: "running", step: "clal_select_month", monthLabel });
  await selectMonthAndSearch(commissionsPage, monthLabel);

  await setStatus(runId, { status: "running", step: "clal_wait_month_refresh", monthLabel });
  await waitForMonthHeader(commissionsPage, monthLabel);

  // ייחודי לבריאות
  await setStatus(runId, { status: "running", step: "clal_briut_open", monthLabel });
  await openBriutReportFromSummary(commissionsPage);

  await setStatus(runId, { status: "running", step: "clal_briut_export_excel", monthLabel });

  // הורדה מקומית
  const absDir = path.resolve(process.cwd(), downloadDir);
  ensureDir(absDir);

  const { download, filename } = await exportExcelFromCurrentReport(commissionsPage);
  const localPath = path.join(absDir, `${Date.now()}_${filename}`);
  await download.saveAs(localPath);

  console.log("[Clal][Briut] excel saved:", localPath);

  // העלאה ל-Storage
  await setStatus(runId, { status: "running", step: "clal_briut_uploading", monthLabel });

  const bucketName = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error("Missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET in runner env");

  const bucket = admin.storage().bucket(bucketName);
  const storagePath = `portalRuns/${runId}/${path.basename(localPath)}`;

  await bucket.upload(localPath, {
    destination: storagePath,
    contentType: filename.toLowerCase().endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/octet-stream",
  });

  await setStatus(runId, {
    status: "file_uploaded",
    step: "clal_briut_done",
    monthLabel,
    download: {
      localPath,
      filename,
      storagePath,
      bucket: bucketName,
    },
  });

  console.log("[Clal][Briut] uploaded to storage:", `${bucketName}/${storagePath}`);

  await browser.close().catch(() => {});
}
