import fs from "fs";
import path from "path";
import { chromium, BrowserContext, Browser } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";

import {
  clalLogin,
  clalHandleOtp,
  gotoCommissionsPage,
  // openAgentsDropdownAndSelectAll,
  selectMonthAndSearch,
  waitForCommissionsGridFilled,
  exportExcelFromCurrentReport,
  openReportFromSummaryByName,
  clickReportTabHeading,
} from "./clal.shared";

import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function s(v: any) {
  return String(v ?? "").trim();
}

async function getClalCredsViaCallable(ctx: RunnerCtx, portalId: string) {
  const functions = (ctx as any).functions;
  if (!functions) throw new Error("Missing ctx.functions");
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId });
  return { username: s(res?.data?.username), password: s(res?.data?.password) };
}

export async function runClalAll(ctx: RunnerCtx) {
  const { runId, setStatus, run } = ctx;
  const portalUrl = "https://www.clalnet.co.il/";
  const isExe = !!(process as any).pkg;

  const agentId = s((ctx.run as any)?.agentId || ctx.agentId);
  const storage = (ctx as any).storage;
  const absDir = s(ctx.paths?.downloadsDir);
  ensureDir(absDir);

  const { username, password } = await getClalCredsViaCallable(ctx, "clal");
  const monthLabel = (run.resolvedWindow?.kind === "month" ? (run.resolvedWindow.label || run.monthLabel) : run.resolvedWindow?.label) || "חודש נוכחי";

  const appendDownload = async (item: any) => {
    const cur = (ctx.run as any)?.downloads;
    const downloads = Array.isArray(cur) ? [...cur, item] : [item];
    (ctx.run as any).downloads = downloads;
    await setStatus(runId, { downloads });
  };

  await setStatus(runId, { status: "running", step: "clal_open_portal", monthLabel });

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  // איתור כרום מקומי - קריטי ל-EXE
  const standardPath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const x86Path = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
  const localChromePath = fs.existsSync(standardPath) ? standardPath : (fs.existsSync(x86Path) ? x86Path : null);
  const executablePath = (isExe && localChromePath) ? localChromePath : resolveChromiumExePath();

  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--start-maximized",
    "--disable-infobars"
  ];

  try {
    console.log(`[Clal] Launching with executable: ${executablePath}`);
    browser = await chromium.launch({
      headless: false, // עדיף false כדי לראות את ההזרקה קורה ב-EXE
      executablePath: executablePath || undefined,
      args,
    });

    context = await browser.newContext({
      viewport: null,
      acceptDownloads: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    await page.bringToFront().catch(() => {});

  // בתוך clal.all.ts
console.log("[Clal] Navigating to portal...");
// מחכים רק ל-commit (תחילת טעינה) כדי שה-waitForURL בתוך הלוגין יעשה את העבודה
await page.goto(portalUrl, { waitUntil: "commit", timeout: 60000 });
await clalLogin(page, username, password);

    await setStatus(runId, { status: "running", step: "clal_otp", monthLabel });
    await clalHandleOtp(page, ctx);

    const commissionsPage = await gotoCommissionsPage(page);
    // await openAgentsDropdownAndSelectAll(commissionsPage);
    // await selectMonthAndSearch(commissionsPage, monthLabel);
    const targetMonth = "פברואר 2026"; 
await selectMonthAndSearch(commissionsPage, targetMonth);
    await waitForCommissionsGridFilled(commissionsPage, 60000);

    const REPORTS: any[] = [
      { linkText: "בריאות", templateId: "clal_briut", stepPrefix: "clal_briut" },
      { linkText: "חיים", templateId: "clal_life", stepPrefix: "clal_life", preExportTabHeading: "פוליסה" },
      { linkText: "גמל", templateId: "clal_gemel", stepPrefix: "clal_gemel", preExportTabHeading: "עמיתים" },
     { linkText: "פנסיה", templateId: "clal_pensia", stepPrefix: "clal_pensia", preExportTabHeading: "עמיתים" },

    ];

   for (const rep of REPORTS) {
  try {
    // עדכון סטטוס לתחילת עבודה על הדוח הספציפי
    await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_open`, monthLabel });
    
    // פתיחת הדוח
    await openReportFromSummaryByName(commissionsPage, rep.linkText);
    
    // מעבר לטאב אם הוגדר
    if (rep.preExportTabHeading) {
      await clickReportTabHeading(commissionsPage, rep.preExportTabHeading);
    }

    // המתנה לטעינת הנתונים
    await waitForCommissionsGridFilled(commissionsPage, 30000);

    // ניסיון הורדה (עכשיו זה מחזיר null אם לא נמצא, בלי לקרוס)
    const { download, filename } = await exportExcelFromCurrentReport(commissionsPage);

    if (download) {
      const localPath = path.join(absDir, `${Date.now()}_${filename}`);
      await download.saveAs(localPath);

      // העלאה לסטורג'
      const up = await uploadLocalFileToStorageClient({ storage, localPath, agentId, runId, subdir: rep.templateId } as any);
      
      // רישום ההורדה במערכת
      await appendDownload({ 
        templateId: rep.templateId, 
        localPath, 
        filename: up.filename || filename, 
        storagePath: up.storagePath 
      });

      await setStatus(runId, { status: "file_uploaded", step: `${rep.stepPrefix}_done` });
      console.log(`[Clal] Successfully processed ${rep.linkText}`);
    } else {
      console.log(`[Clal] No download available for ${rep.linkText}, skipping.`);
    }

  } catch (err: any) {
    // אם דוח אחד נכשל, אנחנו רק מדפיסים שגיאה וממשיכים לדוח הבא בלולאה!
    console.error(`[Clal] Error processing report ${rep.linkText}: ${err.message}`);
    await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_failed`, error: err.message });
  }
}

// רק כאן, מחוץ ללולאה, אנחנו מסמנים שהכל הסתיים
await setStatus(runId, { status: "done", step: "clal_all_done", monthLabel, result: { uploaded: true } });
  } catch (e: any) {
    console.error("[Clal] Error:", e.message);
    if (context && context.pages().length > 0) {
      const p = context.pages()[0];
      const screenshotPath = path.join(s(ctx.paths?.logsDir), `error_${Date.now()}.png`);
      await p.screenshot({ path: screenshotPath }).catch(() => {});
    }
    throw e;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}