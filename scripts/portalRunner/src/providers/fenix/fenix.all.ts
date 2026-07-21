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
  navigateToPhoenixPaymentsSummary,
  phoenixSearchAndSelectCompany,
  phoenixOpenReportByMatch,
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
  return {
    username: s(res?.data?.username),
    password: s(res?.data?.password),
    // TODO: לוודא מול השדה בפועל שנשמר בפרטי הלוגין (Firestore) - כרגע מניחה 'companyTaxId'
    companyTaxId: s(res?.data?.companyTaxId)
  };
}

export async function runPhoenixAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage, log } = ctx;
  const portalUrl = "https://agent.fnx.co.il/";
  const absDir = s(paths!.downloadsDir || "./downloads");
  ensureDir(absDir);

  const agentId = s(run.agentId || ctx.agentId);
  const { username, password, companyTaxId } = await getPhoenixCreds(ctx, "fenix");
  const monthLabel = run.monthLabel || "חודש נוכחי";

  // בית סוכן (ריבוי חברות תחת אותה כניסה) לעומת סוכן רגיל: מזוהה לפי עצם
  // קיומו של companyTaxId בפרטי הלוגין שנשמרו. אם לא הוזן ח.פ, מדלגים על שלב הבחירה.
  const useCompanySearch = Boolean(companyTaxId);

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

    // ניווט: דוחות -> עמלות
    await setStatus(runId, { status: "running", step: "עובר לאזור העמלות...", monthLabel });
    await navigateToPhoenixCommissions(page);

    // ניווט: עמלות -> ריכוז תשלומי עמלות
    await setStatus(runId, { status: "running", step: "עובר לריכוז תשלומי עמלות...", monthLabel });
    await navigateToPhoenixPaymentsSummary(page);

    // בהינתן flag - חיפוש ובחירת חברה/סוכנות לפי ח.פ לפני תחילת הדוחות
    if (useCompanySearch) {
      await setStatus(runId, { status: "running", step: "מאתר סוכנות לפי ח.פ...", monthLabel });
      await phoenixSearchAndSelectCompany(page, companyTaxId);
    }

    // --- הגדרת הדוחות להורדה ---
    // כל שלושת הדוחות הם תת-דוחות בתוך עמוד "ריכוז תשלומי עמלות", וכולם פותחים טאב חדש.
    // ההתאמה נעשית לפי מילות מפתח (include/exclude) ולא טקסט מדויק, כי "נפרעים והפרשי
    // סוכנויות גמל" ו-"הפרשי סוכנויות נפרעים" דומים מאוד זה לזה בטקסט.
    type ReportDef = {
      name: string;
      templateId: string;
      subdir: string;
      include: string[];
      exclude?: string[];
      exact?: string;
    };

    const REPORTS: ReportDef[] = [
      {
        name: "נפרעים",
        templateId: "fenix_insurance",
        subdir: "insurance",
        exact: "נפרעים",
        include: ["נפרעים"],
        exclude: ["גמל", "סוכנויות", "רטרו"]
      },
      {
        name: "נפרעים והפרשי סוכנויות גמל",
        templateId: "fenix_gemel",
        subdir: "gemel",
        exact: "נפרעים (והפרשי סוכנויות)גמל",
        include: ["נפרעים", "גמל"],
        exclude: ["רטרו"]
      }
    ];

    if (useCompanySearch) {
      REPORTS.push({
        name: "הפרשי סוכנויות נפרעים",
        templateId: "fenix_hefreshim",
        subdir: "hefreshim",
        exact: "הפרש סוכנויות (נפרעים)",
        include: ["סוכנויות", "נפרעים"],
        exclude: ["גמל", "רטרו"]
      });
    }

    const appendDownload = async (item: any) => {
      const cur = (run as any).downloads || [];
      const downloads = [...cur, item];
      (run as any).downloads = downloads;
      await setStatus(runId, { downloads });
    };

    // לופ הורדה: כל תת-דוח פותח טאב חדש; אחרי ההורדה סוגרים אותו וחוזרים לעמוד הראשי
    // (ריכוז תשלומי עמלות) לפני שממשיכים לדוח הבא.
    for (const rep of REPORTS) {
      try {
        await setStatus(runId, { status: "running", step: `מפיק דוח: ${rep.name}`, monthLabel });

        // 1. פתיחת הדוח בטאב חדש
const reportPage = await phoenixOpenReportByMatch(page, { include: rep.include, exclude: rep.exclude, exact: rep.exact });

        // 2. הורדת האקסל (עם ההמתנה הממוקדת - ר' fenix.shared.ts)
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

        // 3. סגירת טאב הדוח וחזרה לעמוד הראשי (ריכוז תשלומי עמלות)
        if (reportPage !== page) {
          await reportPage.close().catch(() => {});
        }
        await page.bringToFront();
        await page.waitForTimeout(1500); // "נשימה" קצרה לפני הדוח הבא

      } catch (err: any) {
        log!.error(`[Fenix] Error in report ${rep.name}: ${err.message}`);
      }
    }

    const expectedTemplateIds = REPORTS.map(r => r.templateId);
    const downloadedTemplateIds = ((run as any).downloads || []).map((d: any) => d.templateId);
    const missingTemplateIds = expectedTemplateIds.filter(id => !downloadedTemplateIds.includes(id));

    if (missingTemplateIds.length) {
      await setStatus(runId, {
        missingReports: missingTemplateIds.map(templateId => ({
          templateId,
          reason: "no_data_or_no_button",
        }))
      });
    }

    const totalDownloads = ((run as any)?.downloads || []).length;
    if (totalDownloads === 0) {
      await setStatus(runId, { status: "error", step: "fenix_done_no_files", error: { message: "No downloads[] / download.storagePath found" }, monthLabel });
      throw new Error("No downloads[] / download.storagePath found");
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