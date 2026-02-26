// scripts/portalRunner/src/providers/clal/clal.all.ts
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
  waitForCommissionsGridFilled,
  exportExcelFromCurrentReport,
  openReportFromSummaryByName,
  clickReportTabHeading,
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

type ReportSpec = {
  linkText: "בריאות" | "פנסיה" | "חיים" | "גמל";
  templateId: "clal_briut" | "clal_pensia" | "clal_life" | "clal_gemel";
  stepPrefix: string;
  preExportTabHeading?: "עמיתים" | "פוליסה";
};

const REPORTS: ReportSpec[] = [
  { linkText: "בריאות", templateId: "clal_briut", stepPrefix: "clal_briut" },
  { linkText: "פנסיה", templateId: "clal_pensia", stepPrefix: "clal_pensia", preExportTabHeading: "עמיתים" },
  { linkText: "חיים", templateId: "clal_life", stepPrefix: "clal_life", preExportTabHeading: "פוליסה" },
  { linkText: "גמל", templateId: "clal_gemel", stepPrefix: "clal_gemel", preExportTabHeading: "עמיתים" },
];

export async function runClalAll(ctx: RunnerCtx) {
  const { runId, setStatus, env, run } = ctx;

  const portalUrl = "https://www.clalnet.co.il/";
  const headless = false;

  const agentId = String((ctx.run as any)?.agentId || ctx.agentId || "").trim();
  if (!agentId) throw new Error("Missing agentId (neither run.agentId nor ctx.agentId)");

  const creds = await getPortalCreds({ agentId, portalId: "clal" });
  const username = creds.username;
  const password = creds.password;
  if (creds.requiresPassword && !password) throw new Error("Missing password for clal (portalCredentials)");

  // monthLabel = תיוג/סטטוס בלבד (לא משנים חודש בפורטל)
  const monthLabel =
    (run.resolvedWindow?.kind === "month"
      ? (run.resolvedWindow.label || run.monthLabel)
      : run.resolvedWindow?.label) || "חודש נוכחי";

  const downloadDir = env.DOWNLOAD_DIR || "downloads";
  const absDir = path.isAbsolute(downloadDir) ? downloadDir : path.resolve(process.cwd(), downloadDir);
  ensureDir(absDir);

  const storage = (ctx as any).storage as any | undefined;

  const admin = (ctx as any).admin as any | undefined;
  const canAdminUpload = hasAdminStorage(admin);

  const bucketName = env.FIREBASE_STORAGE_BUCKET || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
  const bucket = canAdminUpload ? admin.storage().bucket(bucketName || undefined) : null;

  const appendDownload = async (item: any) => {
    const cur = (ctx.run as any)?.downloads;
    const downloads = Array.isArray(cur) ? [...cur, item] : [item];
    (ctx.run as any).downloads = downloads;
    await setStatus(runId, { downloads });
  };

  await setStatus(runId, { status: "running", step: "clal_open_portal", monthLabel });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    await page.goto(portalUrl, { waitUntil: "domcontentloaded" });

    await setStatus(runId, { status: "running", step: "clal_login", monthLabel });
    await clalLogin(page, username, password!);

    await setStatus(runId, { status: "running", step: "clal_otp", monthLabel });
    await clalHandleOtp(page, ctx);

    await setStatus(runId, { status: "running", step: "clal_goto_commissions", monthLabel });
    const commissionsPage = await gotoCommissionsPage(page);

    await setStatus(runId, { status: "running", step: "clal_select_all_agents", monthLabel });
    await openAgentsDropdownAndSelectAll(commissionsPage);

    // ✅ לא משנים חודש, רק Search + המתנה שהטבלה תתמלא
    await setStatus(runId, { status: "running", step: "clal_search", monthLabel });
    await selectMonthAndSearch(commissionsPage, monthLabel);

    await setStatus(runId, { status: "running", step: "clal_wait_grid", monthLabel });
    await waitForCommissionsGridFilled(commissionsPage, 60_000);

    // ✅ Multi-file: אותו מסך, פותחים דוח -> (אם צריך) טאב פנימי -> יצוא
    for (const rep of REPORTS) {
      await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_open`, monthLabel });
      await openReportFromSummaryByName(commissionsPage, rep.linkText);

      if (rep.preExportTabHeading) {
        await setStatus(runId, {
          status: "running",
          step: `${rep.stepPrefix}_tab_${rep.preExportTabHeading}`,
          monthLabel,
        });
        await clickReportTabHeading(commissionsPage, rep.preExportTabHeading);
      }

      await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_export_excel`, monthLabel });
      const { download, filename } = await exportExcelFromCurrentReport(commissionsPage);

      const localPath = path.join(absDir, `${Date.now()}_${filename}`);
      await download.saveAs(localPath);

      await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_uploading`, monthLabel });

      let storagePath = "";
      let uploadedFilename = filename;
      let uploadVia: "client" | "admin" = "client";

      if (storage) {
        const up = await uploadLocalFileToStorageClient({
          storage,
          localPath,
          agentId,
          runId,
          subdir: rep.templateId,
        } as any);

        storagePath = up.storagePath;
        uploadedFilename = up.filename || filename;
        uploadVia = "client";
      } else {
        if (!bucket) throw new Error("No storage available for upload (missing ctx.storage in local OR admin bucket in cloud)");

        storagePath = `portalRuns/${agentId}/${runId}/${rep.templateId}/${path.basename(localPath)}`;
        await bucket.upload(localPath, {
          destination: storagePath,
          contentType: guessContentType(filename),
        });

        uploadVia = "admin";
      }

      const item = {
        templateId: rep.templateId,
        localPath,
        filename: uploadedFilename,
        storagePath,
        bucket: bucketName || undefined,
      };

      await appendDownload(item);

      await setStatus(runId, {
        download: item,
        result: { ...(run.result || {}), uploadVia },
      });

      await setStatus(runId, { status: "file_uploaded", step: `${rep.stepPrefix}_done`, monthLabel });
    }

    await setStatus(runId, {
      status: "done",
      step: "clal_all_done",
      monthLabel,
      result: {
        ...(run.result || {}),
        uploaded: true,
      },
    });
  } finally {
    await browser.close().catch(() => {});
  }
}