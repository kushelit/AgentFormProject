import fs from "fs";
import path from "path";
import { chromium, Page } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { meitavLogin, meitavHandleOtp } from "./meitav.shared";

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
  const { runId, setStatus, run, paths } = ctx;
  const portalUrl = "https://www.meitav.co.il/agents_home_page/";
  const absDir = s(paths?.downloadsDir || "./downloads");
  ensureDir(absDir);

  const monthLabel = (run.resolvedWindow?.kind === "month" ? (run.resolvedWindow.label || run.monthLabel) : run.resolvedWindow?.label) || "חודש נוכחי";
  const { username, phoneNumber } = await getMeitavCreds(ctx);

  await setStatus(runId, { status: "running", step: "meitav_open_portal", monthLabel });

  // הגדרת פרופיל קבוע (כמו באיילון)
  const userDataDir = path.join(String(process.env.APPDATA || ""), "MagicSaleRunner", "chromium-profile-meitav");
  const executablePath = resolveChromiumExePath();

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: executablePath || undefined,
    viewport: null,
    acceptDownloads: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--start-maximized"],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    console.log("[Meitav] Navigating to home page...");
    // שימוש ב-domcontentloaded במקום networkidle כדי למנוע את ה-Timeout שחווית
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    
    // המתנה לייצוב קל
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    console.log("[Meitav] Searching for login button...");
    const loginBtn = page.locator('a:has-text("כניסה לחשבון")').first();
    await loginBtn.waitFor({ state: 'visible', timeout: 20000 });
    await loginBtn.click();

    // המתנה למעבר לדף הלוגין המאובטח
    await page.waitForURL(url => url.toString().includes('LoginAgent'), { timeout: 30000 });
    
    await setStatus(runId, { status: "running", step: "מבצע לוגין למיטב", monthLabel });
    await meitavLogin(page, username, phoneNumber);

    // טיפול ב-OTP
    await meitavHandleOtp(page, ctx);

    await setStatus(runId, { status: "done", step: "כניסה למיטב הושלמה", monthLabel });

  } catch (e: any) {
    console.error("[Meitav] Error:", e.message);
    await setStatus(runId, { status: "error", error: e.message, monthLabel });
    throw e;
  }
}