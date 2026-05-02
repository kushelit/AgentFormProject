import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";
import {
  hachsharaLogin,
  hachsharaHandleOtp,
  hachsharaNavigateAndExport,
} from "./hachshara.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function s(v: any) {
  return String(v ?? "").trim();
}

async function getHachsharaCreds(ctx: RunnerCtx) {
  const functions = (ctx as any).functions;
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId: "hachshara" });
  return {
    username: s(res?.data?.username),
    password: s(res?.data?.password),
  };
}

export async function runHachsharaAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage } = ctx;
  const portalUrl = "https://agents-login.hcsra.co.il/my.policy";
  const absDir = s(paths?.downloadsDir || "./downloads");
  ensureDir(absDir);

  const monthLabel = (run.resolvedWindow?.kind === "month"
    ? (run.resolvedWindow.label || run.monthLabel)
    : run.resolvedWindow?.label) || "חודש נוכחי";

  const agentId = s((run as any)?.agentId || ctx.agentId);
  const { username, password } = await getHachsharaCreds(ctx);

  const appendDownload = async (item: any) => {
    const cur = (ctx.run as any)?.downloads || [];
    const downloads = Array.isArray(cur) ? [...cur, item] : [item];
    (ctx.run as any).downloads = downloads;
    await setStatus(runId, { downloads });
  };

  await setStatus(runId, { status: "running", step: "hachshara_open_portal", monthLabel });

  const userDataDir = path.join(
    String(process.env.APPDATA || ""),
    "MagicSaleRunner",
    "chromium-profile-hachshara"
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
    // console.log("[Hachshara] Navigating to portal...");
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

    await setStatus(runId, { status: "running", step: "מבצע לוגין להכשרה", monthLabel });
    await hachsharaLogin(page, username, password);

    await hachsharaHandleOtp(page, ctx);

    await setStatus(runId, { status: "running", step: "מוריד דוחות מהכשרה", monthLabel });
    const downloads = await hachsharaNavigateAndExport(page, absDir);

    if (downloads.length > 0) {
      for (const { localPath, filename, templateId } of downloads) {
        const up = await uploadLocalFileToStorageClient({
          storage,
          localPath,
          agentId,
          runId,
          subdir: templateId,
        } as any);

        if (up?.storagePath) {
          // console.log(`[Hachshara] Uploaded ${templateId}:`, up.storagePath);
          await appendDownload({
            templateId,
            localPath,
            filename: up.filename || filename,
            storagePath: up.storagePath,
          });
        }
      }

      await setStatus(runId, {
        status: "done",
        step: "hachshara_done",
        monthLabel,
        result: { uploaded: true },
      });
    } else {
      await setStatus(runId, { status: "done", step: "hachshara_done_no_files", monthLabel });
    }

  } catch (e: any) {
    // console.error("[Hachshara] Error:", e.message);
    await setStatus(runId, { status: "error", error: e.message, monthLabel });
    throw e;
  } finally {
    await context.close().catch(() => {});
  }
}