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
      // ✅ השתקת פופ-אפים של חיבור למכשירים (כמו שראינו בתמונה)
      "--disable-device-discovery-notifications",
      "--disable-features=WebBluetooth,WebUSB,WebHID,WebSerial,DeviceAttributesService",
      // ✅ מניעת פתיחה של אפליקציות חיצוניות (כמו ה-VPN שקפץ)
      "--no-default-browser-check",
      "--ignore-certificate-errors"
    ] 
   });

context = await browser.newContext({
      viewport: null,
      acceptDownloads: true,
      // הסרנו את "sensors" והחלפנו בשמות המדויקים שהדפדפן מכיר
      permissions: ['geolocation'], 
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    });

    const page: Page = await context.newPage();
    await page.bringToFront().catch(() => {});

    // ניווט וייצוב
    log!.info(`[Fenix] Navigating to: ${portalUrl}`);
    await page.goto(portalUrl, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(5000);

    let inputFound = false;
    for (let i = 0; i < 2; i++) {
      if (await page.locator('#input_1').count() > 0) {
        inputFound = true;
        break;
      }
      log!.info(`[Fenix] Attempt ${i + 1}: Fields not found yet`);
      await handleFenixLoginRedirect(page);
      await page.waitForTimeout(4000);
    }

    if (!inputFound) {
      log!.info("[Fenix] Forcing reload to login page");
      await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(5000);
    }

    // לוגין ו-OTP
    await setStatus(runId, { status: "running", step: "מבצע כניסה...", monthLabel });
    await phoenixLogin(page, username, password);
    await phoenixHandleOtp(page, ctx);

    // ניווט לעמלות
    await setStatus(runId, { status: "running", step: "עובר לאזור העמלות...", monthLabel });
    await navigateToPhoenixCommissions(page);

    // הגדרת הדוחות
    const REPORTS = [
      { name: "עמלות נפרעים", templateId: "fenix_insurance", subdir: "insurance" },
      { name: "פירוט עמלות חיים", templateId: "fenix_life", subdir: "life" } // דוח שני לדוגמה
    ];

    const appendDownload = async (item: any) => {
      const cur = (run as any).downloads || [];
      const downloads = [...cur, item];
      (run as any).downloads = downloads;
      await setStatus(runId, { downloads });
    };

    // לופ הורדה
    for (const rep of REPORTS) {
      try {
        await setStatus(runId, { status: "running", step: `מפיק דוח: ${rep.name}`, monthLabel });

        // פתיחת הדוח בטאב חדש
        const reportPage = await phoenixOpenReport(page, context!, rep.name);
        
        // הורדה מהטאב החדש
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
        
        // סגירת הטאב וחזרה לראשי
        await reportPage.close().catch(() => {});
        await page.bringToFront();
        
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