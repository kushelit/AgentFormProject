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

function s(v: any) { return String(v ?? "").trim(); }

async function getPhoenixCreds(ctx: RunnerCtx, portalId: string) {
  const functions = (ctx as any).functions;
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId });
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
    const executablePath = resolveChromiumExePath();
    browser = await chromium.launch({
      headless: false,
      executablePath: executablePath || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
        "--disable-infobars",
        "--disable-device-discovery-notifications",
        "--disable-features=WebBluetooth,WebUSB,WebHID,WebSerial,DeviceAttributesService",
        "--no-default-browser-check",
        "--ignore-certificate-errors"
      ] 
    });

    context = await browser.newContext({
      viewport: null,
      acceptDownloads: true,
      permissions: ['geolocation'], 
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    });

    const page: Page = await context.newPage();
    await page.bringToFront().catch(() => {});

    // ניווט וייצוב
    log!.info(`[Fenix] Navigating to: ${portalUrl}`);
    await page.goto(portalUrl, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(5000);

    // לוגין ו-OTP
    await setStatus(runId, { status: "running", step: "מבצע כניסה...", monthLabel });
    await phoenixLogin(page, username, password);
    await phoenixHandleOtp(page, ctx);

    // ניווט לעמלות
    await setStatus(runId, { status: "running", step: "עובר לאזור העמלות...", monthLabel });
    await navigateToPhoenixCommissions(page);

    // --- הגדרת הדוחות להורדה ---
    const REPORTS = [
      { 
        name: "עמלות נפרעים", 
        templateId: "fenix_insurance", 
        subdir: "insurance" 
      },
      { 
        name: "עמלות נפרעים והפרשי סוכנויות גמל", 
        templateId: "fenix_gemel", 
        subdir: "gemel" 
      }
    ];

    const appendDownload = async (item: any) => {
      const cur = (run as any).downloads || [];
      const downloads = [...cur, item];
      (run as any).downloads = downloads;
      await setStatus(runId, { downloads });
    };

    // לופ הורדה: עובר על כל דוח ברשימה
    for (const rep of REPORTS) {
      try {
        await setStatus(runId, { status: "running", step: `מפיק דוח: ${rep.name}`, monthLabel });

        // 1. פתיחת הדוח (בדרך כלל בטאב חדש)
        const reportPage = await phoenixOpenReport(page, rep.name);
        
        // 2. המתנה קצרה לווידוא טעינה
        await reportPage.waitForSelector('img[src*="excel"], [title*="אקסל"]', { timeout: 35000 }).catch(() => {
          console.warn(`[Phoenix] Excel button not found for ${rep.name}`);
        });

        // 3. הורדת האקסל
        const download = await phoenixExportExcel(reportPage);
        if (download) {
          const filename = download.suggestedFilename();
          const localPath = path.join(absDir, `${Date.now()}_${filename}`);
          await download.saveAs(localPath);

          const up = await uploadLocalFileToStorageClient({ storage, localPath, agentId, runId, subdir: rep.subdir } as any);
          if (up?.storagePath) {
            await appendDownload({ templateId: rep.templateId, filename: up.filename || filename, storagePath: up.storagePath });
          }
        }
        
        // 4. סגירת הטאב של הדוח וחזרה לדף הראשי (רשימת הדוחות)
        if (reportPage !== page) {
          await reportPage.close().catch(() => {});
        }
        await page.bringToFront();
        await page.waitForTimeout(3000); // "נשימה" קצרה לפני הדוח הבא
        
      } catch (err: any) {
        log!.error(`[Fenix] Error in report ${rep.name}: ${err.message}`);
      }
    }

    await setStatus(runId, { status: "done", step: "הסתיים בהצלחה", monthLabel });

  } catch (e: any) {
    log!.error("[Fenix] Global error:", e.message);
    await setStatus(runId, { status: "error", error: { message: e.message } });
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}