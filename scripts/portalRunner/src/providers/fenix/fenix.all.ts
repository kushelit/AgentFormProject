// scripts/portalRunner/src/providers/fenix/fenix.all.ts
import fs from "fs";
import path from "path";
import { chromium, Browser, BrowserContext, Page, Download } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";

import {
  phoenixLogin,
  phoenixHandleOtp,
  navigateToPhoenixCommissions,
  phoenixOpenReport,
  phoenixExportExcel,
  handleFenixLoginRedirect,
  waitPhoenixLoaderGone
} from "./fenix.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function s(v: any) {
  return String(v ?? "").trim();
}

async function getPhoenixCreds(ctx: RunnerCtx, portalId: string) {
  const functions = (ctx as any).functions;
  if (!functions) throw new Error("Missing ctx.functions");
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId }).catch(e => {
    throw new Error(`Failed to get credentials: ${e.message}`);
  });
  return { username: s(res?.data?.username), password: s(res?.data?.password) };
}

export async function runPhoenixAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage, log } = ctx;
  const portalUrl = "https://agent.fnx.co.il/";
  const absDir = s(paths!.downloadsDir || "./downloads");
  ensureDir(absDir);

  const agentId = s(run.agentId || ctx.agentId);
  const { username, password } = await getPhoenixCreds(ctx, "fenix");

  const monthLabel = run.monthLabel || "חודש נוכחי";

  await setStatus(runId, { status: "running", step: "מאתחל דפדפן לפניקס...", monthLabel });

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    // ────────────────────────────────────────────────
    // Launch & page creation – הכל בתוך try
    // ────────────────────────────────────────────────
    const executablePath = resolveChromiumExePath();
    log!.info(`[Fenix] Launching with executable: ${executablePath}`);

    browser = await chromium.launch({
      headless: false,
      executablePath: executablePath || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
        "--disable-infobars"
      ]
    });

    context = await browser.newContext({
      viewport: null,
      acceptDownloads: true,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    });

    // עכשיו page מוגדר כאן – TypeScript יודע שהוא קיים מכאן ואילך
    const page: Page = await context.newPage();
    await page.bringToFront().catch(() => {});

    // ────────────────────────────────────────────────
    // ניווט ראשוני + ייצוב
    // ────────────────────────────────────────────────
    await setStatus(runId, { status: "running", step: "נכנס לפורטל הפניקס...", monthLabel });
    log!.info(`[Fenix] Navigating to: ${portalUrl}`);

    await page.goto(portalUrl, { waitUntil: "networkidle", timeout: 90000 }).catch(e => {
      log!.warn(`[Fenix] Initial goto timeout, continuing anyway: ${e.message}`);
    });

    await page.waitForTimeout(8000);
    await handleFenixLoginRedirect(page);

    let inputFound = false;
    for (let i = 0; i < 5; i++) {
      const count = await page.locator('#input_1').count().catch(() => 0);
      if (count > 0) {
        inputFound = true;
        break;
      }
      log!.info(`[Fenix] Attempt ${i + 1}: #input_1 not found yet`);
      await handleFenixLoginRedirect(page);
      await page.waitForTimeout(4000);
    }

    if (!inputFound) {
      log!.info("[Fenix] Forcing reload to login page");
      await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(5000);
    }

    // ────────────────────────────────────────────────
    // לוגין + OTP + ניווט + דוחות
    // ────────────────────────────────────────────────
    await setStatus(runId, { status: "running", step: "מבצע כניסה לפניקס...", monthLabel });
    await phoenixLogin(page, username, password);

    log!.info("[Fenix] Reaching OTP stage");
    await phoenixHandleOtp(page, ctx);

    await setStatus(runId, { status: "running", step: "עובר לאזור העמלות...", monthLabel });
    await navigateToPhoenixCommissions(page);

    const REPORTS = [
      { name: "ריכוז עמלות חודשי", templateId: "phoenix_summary", subdir: "summary" },
      { name: "פירוט עמלות חיים",  templateId: "phoenix_life",     subdir: "life"     },
    ];

    const appendDownload = async (item: any) => {
      const cur = (run as any).downloads || [];
      const downloads = Array.isArray(cur) ? [...cur, item] : [item];
      (run as any).downloads = downloads;
      await setStatus(runId, { downloads });
    };

    for (const rep of REPORTS) {
      try {
        await setStatus(runId, {
          status: "running",
          step: `מפיק דוח: ${rep.name}`,
          monthLabel
        });

        await phoenixOpenReport(page, rep.name);
        await waitPhoenixLoaderGone(page, 30000);

        const download = await phoenixExportExcel(page);
        if (download) {
          const filename = download.suggestedFilename() || `fenix_${rep.templateId}_${Date.now()}.xlsx`;
          const localPath = path.join(absDir, `${Date.now()}_${filename}`);

          log!.info(`[Fenix] Saving download: ${localPath}`);
          await download.saveAs(localPath);

          const uploadResult = await uploadLocalFileToStorageClient({
            storage,
            localPath,
            agentId,
            runId,
            subdir: rep.subdir || rep.templateId
          } as any);

          if (uploadResult?.storagePath) {
            await appendDownload({
              templateId: rep.templateId,
              filename: uploadResult.filename || filename,
              storagePath: uploadResult.storagePath
            });
            log!.info(`[Fenix] Uploaded: ${rep.name}`);
          }
        } else {
          log!.warn(`[Fenix] No download for ${rep.name}`);
        }

        await navigateToPhoenixCommissions(page);
      } catch (err: any) {
        log!.error(`[Fenix] Error in report ${rep.name}: ${err.message}`);
        await setStatus(runId, {
          status: "running",
          step: `שגיאה בדוח ${rep.name}`,
          error: { message: err.message }
        });
      }
    }

    await setStatus(runId, {
      status: "done",
      step: "fenix_all_completed",
      monthLabel,
      result: { uploaded: true }
    });

    log!.info("[Fenix] All reports processed successfully");

  } catch (e: any) {
    log!.error("[Fenix] Global error:", e.message);

    const ts = Date.now();
    const logsDir = paths!.logsDir || "./logs";

    // אם הגענו לכאן לפני יצירת page – לא ננסה לצלם מסך
    // (אין צורך ב-if(page) כי page לא מוגדר מחוץ ל-try)
    // אם רוצים בכל זאת – אפשר להוסיף try-catch פנימי, אבל זה מיותר

    await setStatus(runId, {
      status: "error",
      error: { message: e.message || "שגיאה כללית בפניקס" }
    });
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}