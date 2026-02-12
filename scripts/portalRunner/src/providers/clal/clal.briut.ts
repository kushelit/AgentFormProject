// scripts/portalRunner/src/providers/clal/clal.briut.ts
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { getPortalCreds } from "../../portalCredentials";
import {
  clalLogin,
  clalHandleOtp,
  gotoCommissionsPage,
  openAgentsDropdownAndSelectAll,
  selectMonthAndSearch,
  waitForMonthHeader,
  openBriutReportFromSummary,
  exportExcelFromCurrentReport,
} from "./clal.shared";

import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function guessContentType(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

function hasAdminStorage(admin: any): boolean {
  return !!admin && typeof admin.storage === "function";
}

export async function runClalBriut(ctx: RunnerCtx) {
  const { runId, setStatus, env, run } = ctx;

  const portalUrl = env.CLAL_PORTAL_URL || "https://www.clalnet.co.il/";
  const headless = false;

  // ✅ agentId חובה (לקרדנצ'לים + נתיב העלאה)
  const agentId = String(
    (ctx.run as any)?.agentId || ctx.agentId || ""
  ).trim();
  
  if (!agentId) {
    throw new Error("Missing agentId (neither run.agentId nor ctx.agentId)");
  }
  

  // ✅ creds
  const { username, password } = await getPortalCreds({ agentId, portalId: "clal" });

  // ✅ month label
  const resolvedLabel =
    run.resolvedWindow?.kind === "month"
      ? (run.resolvedWindow.label || run.monthLabel)
      : run.resolvedWindow?.label;

  const monthLabel = resolvedLabel || env.CLAL_TEST_MONTH_LABEL || "נובמבר 2025";

  const downloadDir = env.DOWNLOAD_DIR || "downloads";
  const absDir = path.isAbsolute(downloadDir) ? downloadDir : path.resolve(process.cwd(), downloadDir);
  ensureDir(absDir);

  await setStatus(runId, { status: "running", step: "clal_open_portal", monthLabel });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  // ✅ ctx.storage מגיע מה-poller.local.ts (בלוקאל)
  const storage = (ctx as any).storage as any | undefined;

  // ✅ ctx.admin קיים בענן (Cloud Run / runner with admin)
  const admin = (ctx as any).admin as any | undefined;
  const canAdminUpload = hasAdminStorage(admin);

  // אופציונלי: רק לתיעוד
  const bucketName = env.FIREBASE_STORAGE_BUCKET || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
  const bucket = canAdminUpload ? admin.storage().bucket(bucketName || undefined) : null;

  try {
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
    const { download, filename } = await exportExcelFromCurrentReport(commissionsPage);
    const localPath = path.join(absDir, `${Date.now()}_${filename}`);
    await download.saveAs(localPath);

    console.log("[Clal][Briut] excel saved:", localPath);

    // העלאה ל-Storage (agent-scoped)
    await setStatus(runId, { status: "running", step: "clal_briut_uploading", monthLabel });

    let storagePath = "";
    let uploadedFilename = filename;
    let uploadVia: "client" | "admin" = "client";

    // 1) Local client upload (אם קיים ctx.storage)
    if (storage) {
      const up = await uploadLocalFileToStorageClient({
        storage,
        localPath,
        agentId,
        runId,
      });

      storagePath = up.storagePath;
      uploadedFilename = up.filename || filename;
      uploadVia = "client";
      console.log("[Clal][Briut] uploaded (client):", storagePath);
    } else {
      // 2) Cloud admin upload fallback
      if (!bucket) {
        throw new Error("No storage available for upload (missing ctx.storage in local OR admin bucket in cloud)");
      }

      storagePath = `portalRuns/${agentId}/${runId}/${path.basename(localPath)}`;
      await bucket.upload(localPath, {
        destination: storagePath,
        contentType: guessContentType(filename),
      });

      uploadVia = "admin";
      console.log("[Clal][Briut] uploaded (admin):", `${bucketName}/${storagePath}`);
    }

    await setStatus(runId, {
      status: "file_uploaded",
      step: "clal_briut_done",
      monthLabel,
      download: {
        localPath,
        filename: uploadedFilename,
        storagePath,
        bucket: bucketName || undefined,
      },
      result: {
        uploaded: true,
        uploadVia,
      },
    });
  } finally {
    await browser.close().catch(() => {});
  }
}
