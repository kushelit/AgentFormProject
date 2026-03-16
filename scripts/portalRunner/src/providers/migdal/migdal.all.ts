import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { 
  migdalLogin, 
  migdalHandleOtp, 
  migdalOpenReport, 
  migdalExportExcel,
  waitMigdalLoaderGone 
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
    password: s(res?.data?.password) 
  };
}

export async function runMigdalAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage } = ctx;
  const portalUrl = "https://apmaccess.migdal.co.il/my.policy/";
  
  const absDir = paths?.downloadsDir || "./downloads";
  ensureDir(absDir);

  const agentId = String((run as any)?.agentId || ctx.agentId || "").trim();
  const { username, password } = await getMigdalCredsViaCallable(ctx, "migdal");

  await setStatus(runId, { status: "running", step: "migdal_open_portal" });

  const browser = await chromium.launch({ 
    headless: false, 
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"] 
  });

  const context = await browser.newContext({ 
    viewport: null, 
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    // 1. לוגין ו-OTP
await page.goto(portalUrl, { waitUntil: "commit", timeout: 60000 });
    await setStatus(runId, { status: "running", step: "migdal_login" });
    await migdalLogin(page, username, password!);

await setStatus(runId, { 
      status: "otp_required", 
      step: "ממתין לקוד אימות ממגדל", 
      "otp.mode": "firestore" 
    });
    
    await migdalHandleOtp(page, ctx);
await page.waitForLoadState("networkidle"); // נותן למערכת לסיים את הניתוב אחרי ה-OTP
    await page.waitForURL(/NewEra/i, { timeout: 60000 });
    await waitMigdalLoaderGone(page);

    // 2. מעבר לדף דוחות
    await setStatus(runId, { status: "running", step: "migdal_nav_to_reports" });
    await page.getByText("כלים").click();
    await page.getByText("דוחות").click();
    await page.waitForLoadState("networkidle");

    // 3. רשימת כל הדוחות להורדה (4 תבניות)
    const REPORTS = [
      { name: "פירוט עמלות חיים", templateId: "migdal_life" },
      { name: "פירוט עמלות גמל", templateId: "migdal_gemel" },
      { name: "משולמים לסוכן", templateId: "migdal_meshulamim" },
      { name: "פירוט עמלות אלמנטרי", templateId: "migdal_general" }
    ];

    const appendDownload = async (item: any) => {
      const cur = (ctx.run as any)?.downloads || [];
      const downloads = [...cur, item];
      (ctx.run as any).downloads = downloads;
      await setStatus(runId, { downloads });
    };

    for (const rep of REPORTS) {
      try {
        console.log(`[Migdal] Starting export for: ${rep.name}`);
        await setStatus(runId, { status: "running", step: `migdal_export_${rep.templateId}` });
        
        await migdalOpenReport(page, rep.name);
        const download = await migdalExportExcel(page);
        
        if (download) {
          const filename = download.suggestedFilename();
          const localPath = path.join(absDir, `${Date.now()}_${filename}`);
          await download.saveAs(localPath);

          const up = await uploadLocalFileToStorageClient({
            storage,
            localPath,
            agentId,
            runId,
            subdir: rep.templateId
          } as any);

          if (up?.storagePath) {
            await appendDownload({
              templateId: rep.templateId,
              localPath,
              filename: up.filename || filename,
              storagePath: up.storagePath
            });
          }
        }

        // חזרה לדף החיפוש (Migdal NewEra דורשת חזרה אחורה או לחיצה מחדש על דוחות)
        await page.goBack();
        await waitMigdalLoaderGone(page);

      } catch (repErr: any) {
        console.error(`[Migdal] Failed to download ${rep.name}:`, repErr.message);
      }
    }

    await setStatus(runId, { status: "done", step: "migdal_all_done" });

  } catch (e: any) {
    console.error("[Migdal] Global Run Failed:", e.message);
    await setStatus(runId, { status: "error", error: e.message });
    throw e;
  } finally {
    await browser.close().catch(() => {});
  }
}