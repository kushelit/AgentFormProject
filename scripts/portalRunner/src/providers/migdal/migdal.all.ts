// scripts/portalRunner/src/providers/migdal/migdal.all.ts
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { 
  migdalLogin, 
  migdalHandleOtp, 
  migdalOpenReport, 
  migdalExportExcel,
  waitMigdalLoaderGone,
  navigateToCommissions,
  migdalReturnToAgreements,
  migdalClearModals,
  migdalSearchReports,
  migdalVisibleReportTitles,
  migdalGoToReportsLobby,
  migdalPageToReport
} from "./migdal.shared";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";
import { httpsCallable } from "firebase/functions";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function getMigdalCredsViaCallable(ctx: RunnerCtx, portalId: string) {
  const functions = (ctx as any).functions;
  if (!functions) throw new Error("Missing ctx.functions");
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId });
  const s = (v: any) => String(v ?? "").trim();
  return {
    username: s(res?.data?.username),
    password: s(res?.data?.password),
    companyTaxId: s(res?.data?.companyTaxId)
  };
}

export async function runMigdalAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage } = ctx;
  const portalUrl = "https://apmaccess.migdal.co.il/my.policy/";
  const absDir = paths?.downloadsDir || "./downloads";
  ensureDir(absDir);

  const agentId = String((run as any)?.agentId || ctx.agentId || "").trim();
  const { username, password, companyTaxId } = await getMigdalCredsViaCallable(ctx, "migdal");

  await setStatus(runId, { status: "running", step: "migdal_open_portal" });

  // const browser = await chromium.launch({ 
  //   headless: false, 
  //   args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"] 
  // });

  // const context = await browser.newContext({ 
  //   acceptDownloads: true,
  //   viewport: { width: 1600, height: 900 }, // גודל מסך גדול למניעת הסתרת תפריטים
  //   userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  // });

  // const page = await context.newPage();

  // בתוך פונקציית runMigdalAll - החלק של פתיחת הדפדפן
  const browser = await chromium.launch({ 
    headless: false, 
    args: [
      "--no-sandbox", 
      "--disable-setuid-sandbox", 
      "--disable-blink-features=AutomationControlled", 
      "--start-maximized" // מאלץ חלון גדול
    ] 
  });

  const context = await browser.newContext({ 
    acceptDownloads: true,
    viewport: null, // חשוב! מבטל את ה"קופסה" ומאפשר לאתר להימתח על כל המסך
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  await page.bringToFront().catch(() => {});

  try {
    // 1. לוגין ו-OTP
    await page.goto(portalUrl, { waitUntil: "commit", timeout: 60000 });
    await setStatus(runId, { status: "running", step: "migdal_login" });
    await migdalLogin(page, username, password!);
    await page.waitForTimeout(3000);
    await setStatus
    (runId, { status: "otp_required", 
      step: "ממתין לקוד אימות ממגדל", 
       otp: { mode: "firestore", state: "required", value: "" },
    });
    await migdalHandleOtp(page, ctx);

await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForURL(/NewEra/i, { timeout: 60000 });
    await waitMigdalLoaderGone(page);

// שלב הניקוי החדש:
await migdalClearModals(page);

    // 2. ניווט לדף עמלות
    await setStatus(runId, { status: "running", step: "מנווט לדוחות עמלות" });
    await navigateToCommissions(page);

    // 3. רשימת דוחות להורדה לפי הסדר המבוקש
  // 3. רשימת דוחות להורדה לפי הסדר המבוקש. "משולמים לסוכן" (סוכן רגיל)
    // מוחלף ב"משולמים בעלים" (בית סוכן, כשיש companyTaxId) - לא תוספת,
    // אלא בחירה בין השניים.
  const REPORTS = [
      companyTaxId
        ? { name: "משולמים בעלים", templateId: "migdal_bealim" }
        : { name: "משולמים לסוכן", templateId: "migdal_insurance" },
      { name: "עמלה מדמי ניהול קהש וגמל - לבעלים", templateId: "migdal_gemel" },
      { name: "עמלה מצבירה/דמי ניהול לביטוח חיים לבעלים", templateId: "migdal_life" }
    ];

    // דוחות שלא ירדו — נשמר בריצה לאבחון (שם הדוח, הסיבה, הכותרות שהיו על המסך)
    const missing: any[] = [];
    const recordMissing = async (report: string, reason: string) => {
      missing.push({ report, reason, seen: await migdalVisibleReportTitles(page) });
      await setStatus(runId, { migdalMissing: missing });
    };

    const appendDownload = async (item: any) => {
      const cur = (ctx.run as any)?.downloads || [];
      const downloads = [...cur, item];
      (ctx.run as any).downloads = downloads;
      await setStatus(runId, { downloads });
    };

 for (const rep of REPORTS) {
      try {
        await setStatus(runId, { status: "running", step: `מפיק דוח: ${rep.name}` });
        
        // 1. פתיחת הדוח (כולל העצירה של ה-30 שניות)
        const opened = await migdalOpenReport(page, rep.name);
        if (!opened) {
          await setStatus(runId, { status: "running", step: `דוח לא נמצא: ${rep.name}` });
          await recordMissing(rep.name, "not_found");
          await migdalReturnToAgreements(page);
          continue;
        }

        // 2. ניסיון הורדה
        const download = await migdalExportExcel(page);
        
        if (download) {
          const filename = download.suggestedFilename();
          const localPath = path.join(absDir, `${Date.now()}_${filename}`);
          await download.saveAs(localPath);

          const up = await uploadLocalFileToStorageClient({
            storage, localPath, agentId, runId, subdir: rep.templateId
          } as any);

          if (up?.storagePath) {
            await appendDownload({
              templateId: rep.templateId,
              localPath,
              filename: up.filename || filename,
              storagePath: up.storagePath
            });
          }
          // console.log(`[Migdal] Successfully downloaded: ${rep.name}`);
        } else {
          // console.log(`[Migdal] No download for ${rep.name} (maybe no data?)`);
        }

        // --- כאן השינוי המרכזי ---
        // במקום goBack, אנחנו חוזרים לתפריט דרך הקליקים בצד.
        // אחרי הדוח האחרון לא חוזרים — דוחות ההיקף נכנסים ישר לדף הדוחות הראשי.
        if (rep !== REPORTS[REPORTS.length - 1]) {
          await setStatus(runId, { status: "running", step: `חוזר לתפריט הראשי...` });
          await migdalReturnToAgreements(page);
        }
        
      } catch (repErr: any) {
        // console.error(`[Migdal] Failed to process ${rep.name}:`, repErr.message);
        // אם היתה שגיאה, עדיין ננסה לחזור לתפריט בשביל הדוח הבא
        await migdalReturnToAgreements(page).catch(() => {});
      }
    }

    // 4. דוחות היקף — לא בעמוד הראשון של הרשימה, לכן דרך החיפוש. כל דוח: חיפוש "היקף" → שם מלא → ייצוא.
    //    כשל כאן לא מכשיל את הריצה — הנפרעים כבר ירדו; רק נרשם ב-step.
    const HEKEF_REPORTS = [
      { name: "תפוקה עמלת היקף נטו- שנה נוכחית", templateId: "migdal_hekef" },
      { name: "תפוקה עמלת היקף נטו- שנים קודמות", templateId: "migdal_hekef_shk" }
    ];
    const hekefTimings: any[] = [];
    for (const rep of HEKEF_REPORTS) {
      try {
        await setStatus(runId, { status: "running", step: `מפיק דוח: ${rep.name}` });
        // החיפוש גלוי רק בדף הדוחות הראשי; גיבוי — דפדוף ב"הסכמים ועמלות"
        // זמנים לאבחון (נשמר בריצה: migdalHekefTimings) — כמה לקח להגיע לדף הדוחות ולמצוא את הדוח
        const t0 = Date.now();
        const via = await migdalGoToReportsLobby(page);
        const t1 = Date.now();
        const search = await migdalSearchReports(page, "היקף", rep.name);
        hekefTimings.push({ report: rep.templateId, via, lobbySec: Math.round((t1 - t0) / 1000), searchSec: Math.round((Date.now() - t1) / 1000), search });
        await setStatus(runId, { migdalHekefTimings: hekefTimings });
        let found = search === "FOUND";
        if (!found) {
          await migdalReturnToAgreements(page);
          found = await migdalPageToReport(page, rep.name);
        }
        const opened = found && await migdalOpenReport(page, rep.name, { exact: true });
        if (!opened) {
          await setStatus(runId, { status: "running", step: `migdal_hekef_not_found: ${rep.templateId}` });
          await recordMissing(rep.name, found ? "click_failed" : `search_${search.toLowerCase()}+pager_not_found`);
          continue;
        }

        const download = await migdalExportExcel(page);
        if (download) {
          const filename = download.suggestedFilename();
          const localPath = path.join(absDir, `${Date.now()}_${filename}`);
          await download.saveAs(localPath);
          const up = await uploadLocalFileToStorageClient({
            storage, localPath, agentId, runId, subdir: rep.templateId
          } as any);
          if (up?.storagePath) {
            await appendDownload({
              templateId: rep.templateId,
              localPath,
              filename: up.filename || filename,
              storagePath: up.storagePath
            });
          }
        } else {
          await setStatus(runId, { status: "running", step: `migdal_hekef_no_download: ${rep.templateId}` });
          await recordMissing(rep.name, "no_download");
        }
        // אין חזרה ל"הסכמים ועמלות" — הדוח הבא נכנס ישר לדף הדוחות הראשי
      } catch (err: any) {
        await setStatus(runId, { status: "running", step: `migdal_hekef_failed: ${rep.templateId}` });
        await recordMissing(rep.name, `error: ${String(err?.message || err).slice(0, 200)}`).catch(() => {});
      }
    }

const totalDownloads = ((ctx.run as any)?.downloads || []).length;
    if (totalDownloads === 0) {
      await setStatus(runId, { status: "error", step: "migdal_done_no_files", error: { message: "No downloads[] / download.storagePath found" } });
      throw new Error("No downloads[] / download.storagePath found");
    }
    await setStatus(runId, { status: "done", step: "migdal_all_done" });
        
  } catch (e: any) {
    await setStatus(runId, { status: "error", error: e.message });
    throw e;
  } finally {
    await browser.close().catch(() => {});
  }
}