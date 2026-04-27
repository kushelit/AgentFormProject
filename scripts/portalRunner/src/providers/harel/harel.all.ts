import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";
import { harelLogin, harelHandleOtp, harelNavigateToReport } from "./harel.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function s(v: any) {
  return String(v ?? "").trim();
}

async function getHarelCreds(ctx: RunnerCtx) {
  const functions = (ctx as any).functions;
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId: "harel" });
  return {
    username: s(res?.data?.username),
    password: s(res?.data?.password),
  };
}

export async function runHarelAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage } = ctx;
  const portalUrl = "https://agents.harel-group.co.il/my.policy";
  const absDir = s(paths?.downloadsDir || "./downloads");
  ensureDir(absDir);

  const monthLabel = (run.resolvedWindow?.kind === "month"
    ? (run.resolvedWindow.label || run.monthLabel)
    : run.resolvedWindow?.label) || "חודש נוכחי";

  const agentId = s((run as any)?.agentId || ctx.agentId);
  const { username, password } = await getHarelCreds(ctx);

  // ✅ אותו פטרן כמו Analyst
  const appendDownload = async (item: any) => {
    const cur = (ctx.run as any)?.downloads || [];
    const downloads = Array.isArray(cur) ? [...cur, item] : [item];
    (ctx.run as any).downloads = downloads;
    await setStatus(runId, { downloads });
  };

  await setStatus(runId, { status: "running", step: "harel_open_portal", monthLabel });

  const userDataDir = path.join(
    String(process.env.APPDATA || ""),
    "MagicSaleRunner",
    "chromium-profile-harel"
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
    console.log("[Harel] Navigating to portal...");
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

    await setStatus(runId, { status: "running", step: "מבצע לוגין להראל", monthLabel });
    await harelLogin(page, username, password);

    await harelHandleOtp(page, ctx);

    await setStatus(runId, { status: "running", step: "מנווט לדוח הראל", monthLabel });
    const downloads = await harelNavigateToReport(page, absDir);

    if (downloads.length > 0) {
      for (const { localPath, filename } of downloads) {
        const up = await uploadLocalFileToStorageClient({
          storage,
          localPath,
          agentId,
          runId,
          subdir: "harel_insurance",
        } as any);

        if (up?.storagePath) {
          console.log("[Harel] Uploaded:", up.storagePath);
          await appendDownload({
            templateId: "harel_insurance",
            localPath,
            filename: up.filename || filename,
            storagePath: up.storagePath,
          });
        }
      }

      await setStatus(runId, {
        status: "done",
        step: "harel_done",
        monthLabel,
        result: { uploaded: true },
      });
    } else {
      await setStatus(runId, { status: "done", step: "harel_done_no_files", monthLabel });
    }

  } catch (e: any) {
    console.error("[Harel] Error:", e.message);
    await setStatus(runId, { status: "error", error: e.message, monthLabel });
    throw e;
  } finally {
    await context.close().catch(() => {});
  }
}