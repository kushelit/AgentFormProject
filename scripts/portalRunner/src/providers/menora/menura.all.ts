import fs from "fs";
import path from "path";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";
import { 
  menoraLogin, 
  menoraHandleOtp, 
  menoraNavigateToCommissions, // התיקון כאן
  menoraProduceReport, 
  menoraDownloadZip , menoraSetReportDate
} from "./menora.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function s(v: any) { return String(v ?? "").trim(); }

async function getMenoraCreds(ctx: RunnerCtx) {
  const functions = (ctx as any).functions;
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId: "menora" });
  return { username: s(res?.data?.username), phoneNumber: s(res?.data?.phoneNumber) };
}

export async function runMenoraAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage, log } = ctx;
  const portalUrl = "https://menoranet.menora.co.il/";
  const absDir = s(paths!.downloadsDir || "./downloads");
  ensureDir(absDir);

  const agentId = s(run.agentId || ctx.agentId);
  const { username, phoneNumber } = await getMenoraCreds(ctx);
  const monthLabel = run.monthLabel || "חודש נוכחי";

  await setStatus(runId, { status: "running", step: "מאתחל דפדפן מנורה...", monthLabel });

  const executablePath = resolveChromiumExePath();
  const browser = await chromium.launch({
    headless: false,
    executablePath: executablePath || undefined,
args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      // הקורא הקריטי ביותר - מונע מהאתר לזהות את הדגל navigator.webdriver
      "--disable-blink-features=AutomationControlled", 
      "--start-maximized",
      "--disable-infobars",
      "--ignore-certificate-errors",
      "--no-default-browser-check"
    ]  });

const context = await browser.newContext({ 
    viewport: null, 
    acceptDownloads: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  });
  

  await context.clearCookies(); // ניקוי שאריות אם היו
  await context.clearPermissions();

  const page = await context.newPage();

  try {
    log!.info(`[Menora] Navigating to: ${portalUrl}`);
    await page.goto(portalUrl, { waitUntil: "commit", timeout: 60000 });
    await page.waitForTimeout(5000);
    // כניסה ו-OTP
    await menoraLogin(page, username, phoneNumber);
    await menoraHandleOtp(page, ctx);

    // ניווט והפקה
    await setStatus(runId, { status: "running", step: "ניווט והפקת דוח...", monthLabel });
    await page.waitForTimeout(8000); // 8 שניות של "נשימה"
    await menoraNavigateToCommissions(page);

await setStatus(runId, { status: "running", step: "מזין תאריך לדוח...", monthLabel });

// חישוב חודש נוכחי - 1
const now = new Date();
let targetMonth = now.getMonth(); // 0 = ינואר
let targetYear = now.getFullYear();

if (targetMonth === 0) { // אם ינואר → דצמבר של השנה הקודמת
  targetMonth = 12;
  targetYear--;
}

const monthYearStr = `${String(targetMonth).padStart(2, '0')}.${targetYear}`;

await menoraSetReportDate(page, monthYearStr);


await menoraProduceReport(page);

    // המתנה והורדה
    await setStatus(runId, { status: "running", step: "ממתין להפקת ה-ZIP...", monthLabel });
    const download = await menoraDownloadZip(page);

    if (download) {
      const filename = download.suggestedFilename();
      const localPath = path.join(absDir, `${Date.now()}_${filename}`);
      await download.saveAs(localPath);

      // העלאה לסטורג'
      const up = await uploadLocalFileToStorageClient({
        storage,
        localPath,
        agentId,
        runId,
        subdir: "menora_commissions" 
      } as any);

    if (up?.storagePath) {
  const downloads = [
    {
      templateId: "menura_new_nifraim",
      filename: up.filename || filename,
      storagePath: up.storagePath
    },
    {
      templateId: "menura_new_zvira",
      filename: up.filename || filename,
      storagePath: up.storagePath
    }
  ];

  await setStatus(runId, {
    downloads,
    download: downloads[0], // אם יש אצלך עדיין קוד ישן שמסתכל על download בודד
    status: "done"
  });
}
    }

  } catch (e: any) {
    log!.error("[Menora] Global error:", e.message);
    await setStatus(runId, { status: "error", error: { message: e.message } });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}