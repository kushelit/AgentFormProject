import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { uploadLocalFileToStorageClient } from "../../uploadToStorage.client";
import { meitavLogin, meitavHandleOtp, meitavNavigateAndExport } from "./meitav.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function s(v: any) {
  return String(v ?? "").trim();
}

async function getMeitavCreds(ctx: RunnerCtx) {
  const functions = (ctx as any).functions;
  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId: "meitav" });
  return {
    username: s(res?.data?.username),
    phoneNumber: s(res?.data?.phoneNumber),
  };
}

export async function runMeitavAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths, storage } = ctx;
  const portalUrl = "https://www.meitav.co.il/agents_home_page/";
  const absDir = s(paths?.downloadsDir || "./downloads");
  ensureDir(absDir);

  const monthLabel = (run.resolvedWindow?.kind === "month"
    ? (run.resolvedWindow.label || run.monthLabel)
    : run.resolvedWindow?.label) || "חודש נוכחי";

  const agentId = s((run as any)?.agentId || ctx.agentId);
  const { username, phoneNumber } = await getMeitavCreds(ctx);

  // ✅ פונקציה לעדכון downloads[] - בדיוק כמו clal
  const appendDownload = async (item: any) => {
    const cur = (ctx.run as any)?.downloads || [];
    const downloads = Array.isArray(cur) ? [...cur, item] : [item];
    (ctx.run as any).downloads = downloads;
    await setStatus(runId, { downloads });
  };

  await setStatus(runId, { status: "running", step: "meitav_open_portal", monthLabel });

  const userDataDir = path.join(
    String(process.env.APPDATA || ""),
    "MagicSaleRunner",
    "chromium-profile-meitav"
  );

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: resolveChromiumExePath() || undefined,
    viewport: null,
    acceptDownloads: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--start-maximized"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const page = context.pages()[0] || await context.newPage();
  await page.bringToFront();

  try {
    // console.log("[Meitav] Navigating to home page...");
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    const cdp = await page.context().newCDPSession(page);
    // console.log("[Meitav] URL:", page.url());

    // console.log("[Meitav] Clicking login button...");
    const [loginPage] = await Promise.all([
      context.waitForEvent("page", { timeout: 15000 }).catch(() => null),
      cdp.send("Runtime.evaluate", {
        expression: `(function() {
          const links = Array.from(document.querySelectorAll('a'));
          const target = links.find(a => (a.textContent || '').trim().includes('כניסה לחשבון'));
          if (!target) return 'NOT_FOUND';
          target.click();
          return 'CLICKED: ' + target.href;
        })()`,
        returnByValue: true,
      }),
    ]);

    let loginPage2 = loginPage;
    if (!loginPage2) {
      // console.log("[Meitav] No new tab — navigating directly...");
      await page.goto("https://customers.meitav.co.il/v2/login/LoginAgent", { waitUntil: "domcontentloaded", timeout: 30000 });
      loginPage2 = page;
    }

    await loginPage2.bringToFront();
    await loginPage2.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    await loginPage2.waitForTimeout(3000);
    // console.log("[Meitav] Login page URL:", loginPage2.url());

    await setStatus(runId, { status: "running", step: "מבצע לוגין למיטב", monthLabel });
    await meitavLogin(loginPage2, username, phoneNumber);
    await meitavHandleOtp(loginPage2, ctx);

    await loginPage2.waitForTimeout(10000);
    // console.log("[Meitav] URL after OTP:", loginPage2.url());

    await setStatus(runId, { status: "running", step: "מנסה לנווט לדוח עמלות", monthLabel });
    
    // ✅ meitavNavigateAndExport מחזיר מערך של כל ההורדות (סוכן אחד או יותר)
    const downloads = await meitavNavigateAndExport(loginPage2, absDir);

    if (downloads.length > 0) {
      for (const { localPath, filename, agentName } of downloads) {
        // console.log(`[Meitav] Uploading: ${filename} for agent: ${agentName}`);
        
        const up = await uploadLocalFileToStorageClient({
          storage,
          localPath,
          agentId,
          runId,
          subdir: "meitav_insurance",
        } as any);

        if (up?.storagePath) {
          // console.log("[Meitav] Uploaded:", up.storagePath);
          
          // ✅ עדכון downloads[] עם כל דוח - כמו clal
          await appendDownload({
            templateId: "meitav_insurance",
            localPath,
            filename: up.filename || filename,
            storagePath: up.storagePath,
            agentName, // מידע נוסף לזיהוי
          });
        } else {
          // console.log("[Meitav] Upload failed for:", filename);
        }
      }
      
      await setStatus(runId, { 
        status: "done", 
        step: "meitav_done", 
        monthLabel,
        result: { uploaded: true, count: downloads.length }
      });
    } else {
      await setStatus(runId, { status: "done", step: "meitav_done_no_files", monthLabel });
    }

  } catch (e: any) {
    // console.error("[Meitav] Error:", e.message);
    await setStatus(runId, { status: "error", error: e.message, monthLabel });
    throw e;
  } finally {
    await context.close().catch(() => {});
  }
}