// scripts/portalRunner/src/providers/migdal/migdal.insurance.ts
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { getPortalCreds } from "../../portalCredentials";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";
import {
  envBool,
  migdalLogin,
  migdalHandleOtp,
  migdalEnsureArrived,
  migdalGotoToolsAndReports,
  migdalSearchAndOpenReportFromReports,
  migdalWaitForReportLoaded,
  migdalWaitNoLoading,
  migdalDebugSnapshot,
  migdalExportExcelSimple,
  migdalValidateZipCsvHasRows,
} from "./migdal.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function guessContentType(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".html")) return "text/html";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function hasAdminStorage(admin: any): boolean {
  return !!admin && typeof admin.storage === "function";
}

export async function runMigdalInsurance(ctx: RunnerCtx) {
  console.log("[Migdal] VERSION_MARKER 2026-02-12_agent_scoped_storage_paths_clean_v1");

  const { runId, setStatus, env, run } = ctx;

  const portalUrl = env.MIGDAL_PORTAL_URL || "https://apmaccess.migdal.co.il/my.policy";

  // ✅ headless נוטה להיחסם אחרי OTP -> force headful
  const headless = false;

  const DO_MIGDAL_DEBUG = envBool(env.MIGDAL_DEBUG, false);

  const agentId = String(
    (ctx.run as any)?.agentId || ctx.agentId || ""
  ).trim();
  
  if (!agentId) {
    throw new Error("Missing agentId (neither run.agentId nor ctx.agentId)");
  }
  

  const creds = await getPortalCreds({ agentId, portalId: "migdal" });
  const username = creds.username;
  const password = creds.password;
  
  if (creds.requiresPassword && !password) {
    throw new Error("Missing password for migdal (portalCredentials)");
  }
  
  // ym = "YYYY-MM" (לרישום/דוח)
  const ym = String((run as any)?.resolvedWindow?.ym || (run as any)?.month || "").trim();
  if (!ym) throw new Error("Missing run.resolvedWindow.ym (expected YYYY-MM)");

  await setStatus(runId, { status: "running", step: "migdal_open_portal" });

  const browser = await chromium.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--start-minimized"],
  });

  const downloadDir = env.DOWNLOAD_DIR || "/tmp/downloads";
  const absDir = path.isAbsolute(downloadDir) ? downloadDir : path.resolve(process.cwd(), downloadDir);
  ensureDir(absDir);

  const debugDir = path.join(absDir, "debug");
  ensureDir(debugDir);

  // ✅ Local runner attaches these to ctx (poller.local.ts)
  const storage = (ctx as any).storage as any | undefined;

  // ✅ Cloud run uses firebase-admin
  const admin = (ctx as any).admin as any | undefined;
  const canAdminUpload = hasAdminStorage(admin);

  // Cloud bucket name for reporting only (לא חובה בלוקאל)
  const bucketName =
    env.FIREBASE_STORAGE_BUCKET ||
    env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "";

  const bucket = canAdminUpload ? admin.storage().bucket(bucketName || undefined) : null;

  async function uploadDebugArtifactsCloudSafe(tag: string) {
    // ✅ מעלה debug רק בענן (admin). בלוקאל נשארים על הדיסק.
    if (!DO_MIGDAL_DEBUG) return;
    if (!bucket) return;

    try {
      const files = fs.existsSync(debugDir)
        ? fs
            .readdirSync(debugDir)
            .map((f) => path.join(debugDir, f))
            .filter((p) => fs.existsSync(p) && fs.statSync(p).isFile())
        : [];

      if (!files.length) return;

      await setStatus(runId, { status: "running", step: `migdal_debug_upload_${tag}` });

      for (const localPath of files) {
        const filename = path.basename(localPath);
        const destination = `portalRuns/${agentId}/${runId}/debug/${filename}`;

        await bucket.upload(localPath, {
          destination,
          contentType: guessContentType(filename),
        });
      }

      console.log("[Migdal] debug artifacts uploaded ✅", { tag, count: files.length });
    } catch (e: any) {
      console.log("[Migdal] debug upload failed (ignored):", e?.message || e);
    }
  }

  async function uploadMainFile(savedPath: string) {
    const filename = path.basename(savedPath);

    // ✅ 1) Local client upload (when storage exists)
    if (storage) {
      const up = await uploadLocalFileToStorageClient({
        storage,
        localPath: savedPath,
        agentId,
        runId,
      });

      return {
        storagePath: up.storagePath,
        filename: up.filename || filename,
        bucket: env.FIREBASE_STORAGE_BUCKET || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        via: "client" as const,
      };
    }

    // ✅ 2) Cloud admin upload fallback
    if (!bucket) throw new Error("No storage available for upload (missing ctx.storage in local OR admin bucket in cloud)");

    const storagePath = `portalRuns/${agentId}/${runId}/${filename}`;

    await bucket.upload(savedPath, {
      destination: storagePath,
      contentType: guessContentType(filename),
    });

    return {
      storagePath,
      filename,
      bucket: bucketName || undefined,
      via: "admin" as const,
    };
  }

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
    });

    let page = await context.newPage();

    page.on("close", () => console.log("[PW] page closed"));
    page.on("crash", () => console.log("[PW] page crashed"));
    page.on("pageerror", (e) => console.log("[PW] pageerror:", String(e)));
    page.on("console", (m) => console.log("[PW] console:", m.type(), m.text()));
    context.on("close", () => console.log("[PW] context closed"));
    browser.on("disconnected", () => console.log("[PW] browser disconnected"));

    await page.goto(portalUrl, { waitUntil: "domcontentloaded" });

    await setStatus(runId, { status: "running", step: "migdal_login" });
    await migdalLogin(page, username, password!);

    await setStatus(runId, { status: "running", step: "migdal_otp" });
    page = await migdalHandleOtp(page, context, ctx);

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(800).catch(() => {});
    await migdalWaitNoLoading(page, 120_000).catch(() => {});

    await setStatus(runId, { status: "running", step: "migdal_ensure_arrived" });
    await migdalEnsureArrived(page);

    await setStatus(runId, { status: "running", step: "migdal_nav_tools_reports" });
    page = await migdalGotoToolsAndReports(page, context);
    await migdalWaitNoLoading(page, 120_000).catch(() => {});

    await setStatus(runId, { status: "running", step: "migdal_reports_search_meshulamim" });
    page = await migdalSearchAndOpenReportFromReports(page, "משולמים לסוכן");

    await setStatus(runId, { status: "running", step: "migdal_wait_report_loaded" });
    await migdalWaitForReportLoaded(page);
    await migdalWaitNoLoading(page, 120_000).catch(() => {});

    await page.waitForTimeout(800).catch(() => {});
    await migdalWaitNoLoading(page, 120_000).catch(() => {});

    if (DO_MIGDAL_DEBUG) {
      await setStatus(runId, { status: "running", step: "migdal_debug_before_export_excel" });
      await migdalDebugSnapshot({
        page,
        dir: debugDir,
        label: `run_${runId}__before_export_excel`,
      }).catch(() => {});
      await uploadDebugArtifactsCloudSafe("before_export_excel");
    }

    // =========================
    // Export
    // =========================
    await setStatus(runId, { status: "running", step: "migdal_export_excel" });

    const res = await migdalExportExcelSimple(page, context, absDir);
    const savedPath = res.savedPath;

    console.log("[Migdal] export saved:", savedPath);

    if (DO_MIGDAL_DEBUG) {
      await uploadDebugArtifactsCloudSafe("after_export_excel");
    }

    // Validate content
    let okLikelyHasData = false;
    if (savedPath.toLowerCase().endsWith(".zip")) {
      await migdalValidateZipCsvHasRows(savedPath, 1);
      okLikelyHasData = true;
    } else {
      const size = fs.existsSync(savedPath) ? fs.statSync(savedPath).size : 0;
      okLikelyHasData = size > 2_000;
    }

    // =========================
    // Upload (agent-scoped)
    // =========================
    await setStatus(runId, { status: "running", step: "migdal_uploading" });

    const uploaded = await uploadMainFile(savedPath);

    console.log("[Migdal] uploaded ✅", uploaded);

    if (DO_MIGDAL_DEBUG) await uploadDebugArtifactsCloudSafe("final");

    await setStatus(runId, {
      status: "done",
      step: "migdal_done",
      download: {
        localPath: savedPath,
        filename: uploaded.filename,
        storagePath: uploaded.storagePath,
        bucket: uploaded.bucket,
      },
      result: {
        downloaded: true,
        ym,
        attempts: 1,
        okLikelyHasData,
        validated: true,
        method: "export_excel",
        uploadVia: uploaded.via,
      },
    });

    return;
  } catch (e: any) {
    console.log("[Migdal] RUN FAILED:", e?.message || e);
    await uploadDebugArtifactsCloudSafe("run_failed").catch(() => {});
    throw e;
  } finally {
    await browser.close().catch(() => {});
  }
}
