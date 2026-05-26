import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";
import { morLogin, morHandleOtp, morNavigateToReport, morNavigateToVolumeReport } from "./mor.shared";


function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function s(v: any) {
  return String(v ?? "").trim();
}

async function getMorCreds(ctx: RunnerCtx) {
  const functions = (ctx as any).functions;
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId: "mor" });

  return {
    licenseNumber: s(res?.data?.licenseNumber),
    username: s(res?.data?.username),
    phoneNumber: s(res?.data?.phoneNumber),
  };
}

export async function runMorAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage } = ctx;
  const portalUrl = "https://join.more.co.il/agentsportal/agents/login";
  const absDir = s(paths?.downloadsDir || "./downloads");
  ensureDir(absDir);

  const monthLabel = (run.resolvedWindow?.kind === "month"
    ? (run.resolvedWindow.label || run.monthLabel)
    : run.resolvedWindow?.label) || "חודש נוכחי";

  const agentId = s((run as any)?.agentId || ctx.agentId);
  const { licenseNumber, username, phoneNumber } = await getMorCreds(ctx);
  // console.log("[Mor] Creds:", { licenseNumber, username, phoneNumber });

  await setStatus(runId, { status: "running", step: "mor_open_portal", monthLabel });

  const userDataDir = path.join(
    String(process.env.APPDATA || ""),
    "MagicSaleRunner",
    "chromium-profile-mor"
  );
  // console.log("[Mor] userDataDir:", userDataDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: resolveChromiumExePath() || undefined,
    viewport: null,
    acceptDownloads: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--start-maximized"],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.bringToFront();

  try {
    // console.log("[Mor] Navigating to portal...");
await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

await page.waitForTimeout(3000);

    const cdp = await page.context().newCDPSession(page);
    const cdpCheck = await cdp.send("Runtime.evaluate", {
      expression: `document.querySelectorAll('*').length`,
      returnByValue: true,
    });
    // console.log("[Mor] CDP elements:", cdpCheck.result.value);

    await setStatus(runId, { status: "running", step: "מבצע לוגין למור", monthLabel });
    await morLogin(page, licenseNumber, username, phoneNumber);

    await morHandleOtp(page, ctx);

    await setStatus(runId, { status: "running", step: "מנסה לנווט לדוח", monthLabel });
    const download = await morNavigateToReport(page);

  const appendDownload = async (item: any) => {
      const cur = (ctx.run as any)?.downloads || [];
      const downloads = Array.isArray(cur) ? [...cur, item] : [item];
      (ctx.run as any).downloads = downloads;
      await setStatus(runId, { downloads });
    };

    // דוח נפרעים
    if (download) {
      const filename = download.suggestedFilename();
      const localPath = path.join(absDir, `${Date.now()}_${filename}`);
      await download.saveAs(localPath);

      const up = await uploadLocalFileToStorageClient({
        storage, localPath, agentId, runId, subdir: "mor_insurance",
      } as any);

      if (up?.storagePath) {
        await appendDownload({
          templateId: "mor_insurance",
          localPath,
          filename: up.filename || filename,
          storagePath: up.storagePath,
        });
      }
    }

    // דוח גיוסים (תפוקות)
    await setStatus(runId, { status: "running", step: "מוריד דוח גיוסים ממור", monthLabel });
    const volumeDownload = await morNavigateToVolumeReport(page);

    if (volumeDownload) {
      const filename = volumeDownload.suggestedFilename();
      const localPath = path.join(absDir, `${Date.now()}_${filename}`);
      await volumeDownload.saveAs(localPath);

      const up = await uploadLocalFileToStorageClient({
        storage, localPath, agentId, runId, subdir: "mor_volume",
      } as any);

      if (up?.storagePath) {
        await appendDownload({
          templateId: "mor_volume",
          localPath,
          filename: up.filename || filename,
          storagePath: up.storagePath,
        });
      }
    }

const totalDownloads = ((ctx.run as any)?.downloads || []).length;
    if (totalDownloads === 0) {
      await setStatus(runId, { status: "error", step: "mor_done_no_files", error: { message: "No downloads[] / download.storagePath found" }, monthLabel });
      throw new Error("No downloads[] / download.storagePath found");
    }
    await setStatus(runId, { status: "done", step: "mor_done", monthLabel, result: { uploaded: true } });
    
  } catch (e: any) {
    // console.error("[Mor] Error:", e.message);
    await setStatus(runId, { status: "error", error: e.message, monthLabel });
    throw e;
  } finally {
    await context.close().catch(() => {});
  }
}