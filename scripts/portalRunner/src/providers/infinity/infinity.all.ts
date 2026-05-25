import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";
import { infinityLogin, infinityHandleOtp, infinityNavigateAndExport } from "./infinity.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function s(v: any) {
  return String(v ?? "").trim();
}

async function getInfinityCreds(ctx: RunnerCtx) {
  const functions = (ctx as any).functions;
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId: "infinity" });
  return {
    idNumber: s(res?.data?.username),
  };
}

export async function runInfinityAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage } = ctx;
  const portalUrl = "https://optimus-agent.malam-payroll.com/#/login/infinity-gemel";
  const absDir = s(paths?.downloadsDir || "./downloads");
  ensureDir(absDir);

  const monthLabel =
    (run.resolvedWindow?.kind === "month"
      ? run.resolvedWindow.label || run.monthLabel
      : run.resolvedWindow?.label) || "חודש נוכחי";

  const agentId = s((run as any)?.agentId || ctx.agentId);
  const { idNumber } = await getInfinityCreds(ctx);

  const appendDownload = async (item: any) => {
    const cur = (ctx.run as any)?.downloads || [];
    const downloads = Array.isArray(cur) ? [...cur, item] : [item];
    (ctx.run as any).downloads = downloads;
    await setStatus(runId, { downloads });
  };

  await setStatus(runId, {
    status: "running",
    step: "infinity_open_portal",
    monthLabel,
  });

  const userDataDir = path.join(
    String(process.env.APPDATA || ""),
    "MagicSaleRunner",
    "chromium-profile-infinity"
  );

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: resolveChromiumExePath() || undefined,
    viewport: null,
    acceptDownloads: true,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--start-maximized",
    ],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.bringToFront();

  try {
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    await setStatus(runId, {
      status: "running",
      step: "מבצע לוגין לאינפיניטי גמל",
      monthLabel,
    });
    await infinityLogin(page, idNumber);

    await infinityHandleOtp(page, ctx);

    await setStatus(runId, {
      status: "running",
      step: "מוריד דוח מאינפיניטי גמל",
      monthLabel,
    });
    const download = await infinityNavigateAndExport(page);

    if (download) {
      const filename = download.suggestedFilename();
      const localPath = path.join(absDir, `${Date.now()}_${filename}`);
      await download.saveAs(localPath);

      const up = await uploadLocalFileToStorageClient({
        storage,
        localPath,
        agentId,
        runId,
        subdir: "infinity_insurance",
      } as any);

      if (up?.storagePath) {
        await appendDownload({
          templateId: "infinity_insurance",
          localPath,
          filename: up.filename || filename,
          storagePath: up.storagePath,
        });
      }

      await setStatus(runId, {
        status: "done",
        step: "infinity_done",
        monthLabel,
        result: { uploaded: true },
      });
    } else {
      await setStatus(runId, {
        status: "error",
        step: "infinity_done_no_file",
        error: { message: "No download / storagePath found" },
        monthLabel,
      });
      throw new Error("No download / storagePath found");
    }
  } catch (e: any) {
    await setStatus(runId, { status: "error", error: e.message, monthLabel });
    throw e;
  } finally {
    await context.close().catch(() => {});
  }
}