// scripts/portalRunner/src/providers/migdal/migdal.insurance.ts
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { getPortalCreds } from "../../portalCredentials";
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

export async function runMigdalInsurance(ctx: RunnerCtx) {
  console.log("[Migdal] VERSION_MARKER 2026-02-11_export_excel_simple");

  const { runId, setStatus, env, run, admin } = ctx;

  const portalUrl = env.MIGDAL_PORTAL_URL || "https://apmaccess.migdal.co.il/my.policy";

  // ✅ headless נוטה להיחסם אחרי OTP -> force headful
  const headless = false;

  // ✅ MIGDAL_DEBUG - גם מה-env של Cloud Run וגם מה-ctx.env
  const DO_MIGDAL_DEBUG = envBool(process.env.MIGDAL_DEBUG || (env as any).MIGDAL_DEBUG, false);
  console.log(
    "[Migdal] MIGDAL_DEBUG raw=",
    process.env.MIGDAL_DEBUG,
    "ctx.env=",
    (env as any).MIGDAL_DEBUG,
    "=>",
    DO_MIGDAL_DEBUG
  );

  const agentId = String((run as any)?.agentId || "").trim();
  if (!agentId) throw new Error("Missing run.agentId");

  const { username, password } = await getPortalCreds({ agentId, portalId: "migdal" });

  // ym = "YYYY-MM" (לא משנים חודש במגדל, אבל שומרים לתיעוד/תוצאה)
  const ym = String((run as any)?.resolvedWindow?.ym || (run as any)?.month || "").trim();
  if (!ym) throw new Error("Missing run.resolvedWindow.ym (expected YYYY-MM)");

  await setStatus(runId, { status: "running", step: "migdal_open_portal" });

  const browser = await chromium.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--start-minimized"],
  });

  // ✅ Cloud Run: תמיד לעבוד ב-/tmp | לוקאל: אפשר לשים downloads/
  const downloadDir = env.DOWNLOAD_DIR || "/tmp/downloads";
  const absDir = path.isAbsolute(downloadDir) ? downloadDir : path.resolve(process.cwd(), downloadDir);
  ensureDir(absDir);

  const debugDir = path.join(absDir, "debug");
  ensureDir(debugDir);

  const bucketName =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "";
  if (!bucketName) throw new Error("Missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET in runner env");

  const bucket = admin.storage().bucket(bucketName);

  async function uploadDebugFolderSafe(tag: string) {
    if (!DO_MIGDAL_DEBUG) return;
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
        const lower = filename.toLowerCase();

        const contentType =
          lower.endsWith(".png")
            ? "image/png"
            : lower.endsWith(".html")
            ? "text/html"
            : lower.endsWith(".json")
            ? "application/json"
            : lower.endsWith(".zip")
            ? "application/zip"
            : lower.endsWith(".csv")
            ? "text/csv"
            : lower.endsWith(".xlsx")
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/plain";

        await bucket.upload(localPath, {
          destination: `portalRuns/${runId}/debug/${filename}`,
          contentType,
        });
      }

      console.log("[Migdal] debug artifacts uploaded ✅", { tag, count: files.length });
    } catch (e: any) {
      console.log("[Migdal] debug upload failed (ignored):", e?.message || e);
    }
  }

  async function uploadFileToDebugSafe(localPath: string, tag: string) {
    if (!DO_MIGDAL_DEBUG) return;
    try {
      if (!localPath || !fs.existsSync(localPath)) return;

      const filename = path.basename(localPath);
      const lower = filename.toLowerCase();

      const contentType =
        lower.endsWith(".zip")
          ? "application/zip"
          : lower.endsWith(".csv")
          ? "text/csv"
          : lower.endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/octet-stream";

      await bucket.upload(localPath, {
        destination: `portalRuns/${runId}/debug/${tag}__${filename}`,
        contentType,
      });

      console.log("[Migdal] uploaded debug file ✅", { tag, filename });
    } catch (e: any) {
      console.log("[Migdal] upload debug file failed (ignored):", e?.message || e);
    }
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
    await migdalLogin(page, username, password);

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
      await migdalDebugSnapshot({ page, dir: debugDir, label: `run_${runId}__before_export_excel` }).catch(() => {});
      await uploadDebugFolderSafe("before_export_excel");
    }

    // =========================
    // ✅ Simple export: "ייצוא לאקסל" (no modal, no month changes)
    // =========================
    await setStatus(runId, { status: "running", step: "migdal_export_excel" });

    let savedPath = "";
    let okLikelyHasData = false;
    let attempts = 1;

    try {
      const res = await migdalExportExcelSimple(page, context, absDir);
      savedPath = res.savedPath;
      attempts = 1;
      okLikelyHasData = true;
      console.log("[Migdal] export excel saved:", savedPath);

      if (DO_MIGDAL_DEBUG) {
        await uploadFileToDebugSafe(savedPath, "excel_download");
        await uploadDebugFolderSafe("after_export_excel");
      }
    } catch (e: any) {
      console.log("[Migdal] export excel failed:", e?.message || e);

      if (DO_MIGDAL_DEBUG) {
        await migdalDebugSnapshot({ page, dir: debugDir, label: `run_${runId}__export_excel_failed` }).catch(() => {});
        await uploadDebugFolderSafe("export_excel_failed");
      }

      throw e;
    }

    // ✅ אם יצא ZIP – אפשר לאמת שיש בו CSV עם שורות (מומלץ כדי למנוע "כותרות בלבד")
    if (savedPath.toLowerCase().endsWith(".zip")) {
      await migdalValidateZipCsvHasRows(savedPath, 1);
    } else {
      // בדיקה מינימלית: אם קובץ ממש קטן, סביר שהוא לא נתונים
      const size = fs.existsSync(savedPath) ? fs.statSync(savedPath).size : 0;
      okLikelyHasData = size > 2_000; // threshold מינימלי
    }

    // =========================
    // Upload to Storage
    // =========================
    await setStatus(runId, { status: "running", step: "migdal_uploading" });

    const filename = path.basename(savedPath);
    const storagePath = `portalRuns/${runId}/${filename}`;

    const lower = filename.toLowerCase();
    const contentType =
      lower.endsWith(".zip")
        ? "application/zip"
        : lower.endsWith(".xlsx")
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : lower.endsWith(".csv")
        ? "text/csv"
        : "application/octet-stream";

    await bucket.upload(savedPath, {
      destination: storagePath,
      contentType,
    });

    console.log("[Migdal] uploaded to storage:", `${bucketName}/${storagePath}`);

    if (DO_MIGDAL_DEBUG) await uploadDebugFolderSafe("final");

    await setStatus(runId, {
      status: "done",
      step: "migdal_done",
      download: { localPath: savedPath, filename, storagePath, bucket: bucketName },
      result: { downloaded: true, ym, attempts, okLikelyHasData, validated: true, method: "export_excel" },
    });

    return;
  } catch (e: any) {
    console.log("[Migdal] RUN FAILED:", e?.message || e);
    await uploadDebugFolderSafe("run_failed").catch(() => {});
    throw e;
  } finally {
    await browser.close().catch(() => {});
  }
}
