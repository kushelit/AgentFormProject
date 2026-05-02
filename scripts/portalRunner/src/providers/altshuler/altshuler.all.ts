import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";
import { altshulerLogin, altshulerHandleOtp, altshulerNavigateAndExport } from "./altshuler.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function s(v: any) {
  return String(v ?? "").trim();
}
async function getAltshulerCreds(ctx: RunnerCtx) {
  const functions = (ctx as any).functions;
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId: "altshuler" });
  return {
    companyId: s(res?.data?.licenseNumber),  // ח.פ = licenseNumber
    idNumber: s(res?.data?.username),         // ת"ז = username
  };
}

export async function runAltshulerAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage } = ctx;
  const portalUrl = "https://agents.as-invest.co.il/Login";
  const absDir = s(paths?.downloadsDir || "./downloads");
  ensureDir(absDir);

  const monthLabel = (run.resolvedWindow?.kind === "month"
    ? (run.resolvedWindow.label || run.monthLabel)
    : run.resolvedWindow?.label) || "חודש נוכחי";

  const agentId = s((run as any)?.agentId || ctx.agentId);
  const { companyId, idNumber } = await getAltshulerCreds(ctx);

  const appendDownload = async (item: any) => {
    const cur = (ctx.run as any)?.downloads || [];
    const downloads = Array.isArray(cur) ? [...cur, item] : [item];
    (ctx.run as any).downloads = downloads;
    await setStatus(runId, { downloads });
  };

  await setStatus(runId, { status: "running", step: "altshuler_open_portal", monthLabel });

  const userDataDir = path.join(
    String(process.env.APPDATA || ""),
    "MagicSaleRunner",
    "chromium-profile-altshuler"
  );

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: resolveChromiumExePath() || undefined,
    viewport: null,
    acceptDownloads: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--start-maximized"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const page = context.pages()[0] || await context.newPage();
  await page.bringToFront();

  try {
    // console.log("[Altshuler] Navigating to portal...");
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await setStatus(runId, { status: "running", step: "מבצע לוגין לאלטשולר", monthLabel });
    await altshulerLogin(page, companyId, idNumber);

    await altshulerHandleOtp(page, ctx);

    await setStatus(runId, { status: "running", step: "מוריד דוח מאלטשולר", monthLabel });
    const downloads = await altshulerNavigateAndExport(page, absDir);

    if (downloads.length > 0) {
      for (const { localPath, filename } of downloads) {
        const up = await uploadLocalFileToStorageClient({
          storage,
          localPath,
          agentId,
          runId,
          subdir: "altshuler_insurance",
        } as any);

        if (up?.storagePath) {
          // console.log("[Altshuler] Uploaded:", up.storagePath);
          await appendDownload({
            templateId: "altshuler_insurance",
            localPath,
            filename: up.filename || filename,
            storagePath: up.storagePath,
          });
        }
      }

      await setStatus(runId, {
        status: "done",
        step: "altshuler_done",
        monthLabel,
        result: { uploaded: true },
      });
    } else {
      await setStatus(runId, { status: "done", step: "altshuler_done_no_files", monthLabel });
    }

  } catch (e: any) {
    // console.error("[Altshuler] Error:", e.message);
    await setStatus(runId, { status: "error", error: e.message, monthLabel });
    throw e;
  } finally {
    await context.close().catch(() => {});
  }
}