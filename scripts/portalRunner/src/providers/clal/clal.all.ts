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
  clickSearchOnly,
  waitForCommissionsGridFilled,
  openAgentsDropdownAndSelectAll,
  exportExcelFromCurrentReport,
  openReportFromSummaryByName,
  clickReportTabHeading,
  waitClalLoaderGone
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
    const cur = (ctx.run as any)?.downloads || [];
    const downloads = Array.isArray(cur) ? [...cur, item] : [item];
    (ctx.run as any).downloads = downloads;
    await setStatus(runId, { downloads });
  };

  await setStatus(runId, { status: "running", step: "clal_open_portal", monthLabel });

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  // איתור כרום מקומי - קריטי ל-EXE כדי למנוע בעיות תאימות
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
      headless: false, 
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

    console.log("[Clal] Navigating to portal...");
    await page.goto(portalUrl, { waitUntil: "commit", timeout: 60000 });
    
    // הזרקת לוגין
    await clalLogin(page, username, password);

    await setStatus(runId, { status: "running", step: "clal_otp", monthLabel });
    await clalHandleOtp(page, ctx);

    // מעבר לדף עמלות (פתיחת טאב חדש)
    const commissionsPage = await gotoCommissionsPage(page);

    // המתנה קריטית: ב-EXE דף העמלות נטען לאט בגלל F5 ו-Angular
    console.log("[Clal] Waiting for commissions page to stabilize...");
    await commissionsPage.waitForTimeout(4000); 
    await waitClalLoaderGone(commissionsPage, 30000);

    // בחירת סוכנים וחיפוש (לפי הזרקת String)
    await openAgentsDropdownAndSelectAll(commissionsPage);
    await clickSearchOnly(commissionsPage);

    // המתנה שהגריד הראשי יתמלא
  // ... אחרי ה-Search ...
    await waitForCommissionsGridFilled(commissionsPage, 30000);

    const REPORTS: any[] = [
      { linkText: "חיים", templateId: "clal_life", stepPrefix: "clal_life", preExportTabHeading: "פוליסה" },
      { linkText: "גמל", templateId: "clal_gemel", stepPrefix: "clal_gemel", preExportTabHeading: "עמיתים" },
    ];

    for (const rep of REPORTS) {
      try {
        await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_open` });
        
        // 1. לחיצה על הדוח (חיים) - הזרקת String
        await openReportFromSummaryByName(commissionsPage, rep.linkText);
        
        // 2. במקום לחכות 4 שניות קבועות, נחכה רק שהלואדר ייעלם (אם הוא קיים)
        await waitClalLoaderGone(commissionsPage, 10000);
        // המתנה קצרה של שניה אחת רק לביטחון של אנגולר
        await commissionsPage.waitForTimeout(1000); 

        if (rep.preExportTabHeading) {
          // שימוש בפונקציית הטאב המדויקת שמונעת לחיצה על "סוכנים בפוליסה"
          await clickReportTabHeading(commissionsPage, rep.preExportTabHeading);
        }

        await waitForCommissionsGridFilled(commissionsPage, 45000);
        await commissionsPage.waitForTimeout(1000); // נשימה לפני הורדה
        
        // הורדת אקסל (הזרקת String)
        const { download, filename } = await exportExcelFromCurrentReport(commissionsPage);

        if (download) {
          const localPath = path.join(absDir, `${Date.now()}_${filename}`);
          await download.saveAs(localPath);
          console.log(`[Clal] Saved: ${localPath}`);

          // העלאה לסטורג'
          const up = await uploadLocalFileToStorageClient({ 
            storage, 
            localPath, 
            agentId, 
            runId, 
            subdir: rep.templateId 
          } as any);
          
          if (up && up.storagePath) {
            await appendDownload({ 
              templateId: rep.templateId, 
              localPath, 
              filename: up.filename || filename, 
              storagePath: up.storagePath 
            });

            await setStatus(runId, { status: "file_uploaded", step: `${rep.stepPrefix}_done` });
            console.log(`[Clal] Done: ${rep.linkText}`);
          }
        } else {
          console.log(`[Clal] No download found for ${rep.linkText}`);
        }

      } catch (err: any) {
        console.error(`[Clal] Error in ${rep.linkText}: ${err.message}`);
        await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_failed`, error: err.message });
      }
    }

    await setStatus(runId, { status: "done", step: "clal_all_done", monthLabel, result: { uploaded: true } });
    console.log("[Clal] All done!");

  } catch (e: any) {
    console.error("[Clal] Global Error:", e.message);
    if (context && context.pages().length > 0) {
      const p = context.pages()[context.pages().length - 1];
      const screenshotPath = path.join(s(ctx.paths?.logsDir), `error_${Date.now()}.png`);
      await p.screenshot({ path: screenshotPath }).catch(() => {});
    }
    throw e;
  } finally {
    // ב-EXE אנחנו רוצים לסגור הכל בסוף כדי לא להשאיר תהליכים פתוחים
    if (browser) await browser.close().catch(() => {});
  }
}