import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";

import {
  harelLogin,
  harelHandleOtp,
  harelNavigateByDeepLink,
  harelExportExcel
} from "./harel.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function getHarelCreds(ctx: RunnerCtx) {
  const functions = (ctx as any).functions;
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId: "harel" });
  const s = (v: any) => String(v ?? "").trim();
  return { username: s(res?.data?.username), password: s(res?.data?.password) };
}

export async function runHarelAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage } = ctx;
  const portalUrl = "https://agents.harel-group.co.il/my.policy";
  const absDir = paths?.downloadsDir || "./downloads";
  ensureDir(absDir);

  const agentId = String(run?.agentId || ctx.agentId || "").trim();
  const { username, password } = await getHarelCreds(ctx);

  // --- חישוב תאריך דוח (חודש קודם בפורמט YYYYMM) ---
  const now = new Date();
  now.setMonth(now.getMonth() - 1); // חודש אחד אחורה
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const targetDateStr = `${year}${month}`; // תוצאה לדוגמה: 202602

  await setStatus(runId, { status: "running", step: "harel_open_portal" });

  const executablePath = resolveChromiumExePath();
  const browser = await chromium.launch({
    headless: false,
    executablePath: executablePath || undefined,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--start-maximized"]
  });

  const context = await browser.newContext({ 
    viewport: null, 
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    // 1. לוגין
    await page.goto(portalUrl, { waitUntil: "commit" });
    await harelLogin(page, username, password);

    // 2. OTP (כאן מצוין שזה input_1)
    await setStatus(runId, { status: "otp_required", step: "ממתין לקוד אימות מהראל", "otp.mode": "firestore" });
    await harelHandleOtp(page, ctx);

    // 3. ניווט ישיר באמצעות הלינק החכם
    await setStatus(runId, { status: "running", step: "מנווט לדוח עמלות חודשי" });
    await harelNavigateByDeepLink(page, targetDateStr);

    // 4. הפקה והורדה
    await setStatus(runId, { status: "running", step: "מוריד קובץ אקסל" });
    const download = await harelExportExcel(page);

    if (download) {
      const filename = download.suggestedFilename();
      const localPath = path.join(absDir, `${Date.now()}_${filename}`);
      await download.saveAs(localPath);

      const up = await uploadLocalFileToStorageClient({
        storage, localPath, agentId, runId, subdir: "harel_commissions"
      } as any);

      if (up?.storagePath) {
        const downloads = [{
          templateId: "harel_standard",
          filename: up.filename || filename,
          storagePath: up.storagePath
        }];
        await setStatus(runId, { downloads, status: "done", step: "הסתיים בהצלחה" });
      }
    }

  } catch (e: any) {
    console.error("[Harel] Error:", e.message);
    await setStatus(runId, { status: "error", error: e.message });
    throw e;
  } finally {
    await browser.close().catch(() => {});
  }
}