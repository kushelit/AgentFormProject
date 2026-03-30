import fs from "fs";
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { resolveChromiumExePath } from "../../runnerPaths";
import { ayalonLogin, ayalonHandleOtp } from "./ayalon.shared";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function s(v: any) {
  return String(v ?? "").trim();
}

async function getAyalonCreds(ctx: RunnerCtx) {
  const functions = (ctx as any).functions;
  if (!functions) throw new Error("Missing ctx.functions");

  const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
  const res: any = await fn({ portalId: "ayalon" });

  return {
    username: s(res?.data?.username),
    password: s(res?.data?.password),
  };
}

export async function runAyalonAll(ctx: RunnerCtx) {
  const { runId, setStatus, run, paths } = ctx;

  const portalUrl = "https://portal.ayalon-ins.co.il/";
  const absDir = s(paths?.downloadsDir || "./downloads");
  ensureDir(absDir);

  const monthLabel =
    (run.resolvedWindow?.kind === "month"
      ? (run.resolvedWindow.label || run.monthLabel)
      : run.resolvedWindow?.label) || "חודש נוכחי";

  const { username, password } = await getAyalonCreds(ctx);

  await setStatus(runId, {
    status: "running",
    step: "ayalon_open_portal",
    monthLabel,
  });

  const executablePath = resolveChromiumExePath();

  const browser = await chromium.launch({
    headless: false,
    executablePath: executablePath || undefined,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--start-maximized",
    ],
  });

  const context = await browser.newContext({
    viewport: null,
    acceptDownloads: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    console.log("[Ayalon] Navigating to portal...");
    await page.goto(portalUrl, { waitUntil: "commit", timeout: 60000 });

    await setStatus(runId, {
      status: "running",
      step: "מבצע לוגין לאיילון",
      monthLabel,
    });

    await ayalonLogin(page, username, password);

   console.log("[Ayalon] Waiting for post-login navigation/load...");

// אם יש ניווט - נחכה לו, ואם אין - נמשיך
await Promise.race([
  page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 }),
  page.waitForLoadState("domcontentloaded", { timeout: 10000 }),
  page.waitForTimeout(3000),
]).catch(() => {});

// עוד רגע קטן לייצוב
await page.waitForTimeout(2000);

// ננסה לדבג רק אחרי שהדף התייצב
const postLoginDebug: any = await page.evaluate(`
  (function() {
    const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
    const normalize = (val) => (val || "").replace(/\\s+/g, " ").trim();

    return {
      url: window.location.href,
      title: document.title,
      text: normalize(document.body.innerText).substring(0, 500),
      inputs: Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id || "",
        type: i.type || "",
        name: i.name || "",
        className: i.className || "",
        placeholder: i.getAttribute("placeholder") || "",
        alt: i.getAttribute("alt") || "",
        visible: isVisible(i),
        valueLen: (i.value || "").length
      }))
    };
  })()
`);

console.log("[Ayalon] Post-login debug:", JSON.stringify(postLoginDebug, null, 2));

// לא מחכים פה ב-waitForFunction על context שיכול להיהרס;
// רק מנסים לראות אם טקסט OTP כבר עלה
const pageText = String(postLoginDebug?.text || "");
const looksLikeOtp =
  pageText.includes("קוד אישור") ||
  pageText.includes("הזן את הקוד") ||
  pageText.includes("הקוד שקיבלת");

console.log("[Ayalon] OTP text detected?", looksLikeOtp);

await setStatus(runId, {
  status: "otp_required",
  step: "ממתין לקוד אימות (SMS) מחברת איילון",
  "otp.mode": "firestore",
  monthLabel,
});

await ayalonHandleOtp(page, ctx);

    await page.waitForLoadState("networkidle").catch(() => {});
    await setStatus(runId, {
      status: "done",
      step: "כניסה לאיילון הושלמה",
      monthLabel,
    });
  } catch (e: any) {
    console.error("[Ayalon] Error:", e?.message || e);
    await setStatus(runId, {
      status: "error",
      error: e?.message || String(e),
      monthLabel,
    });
    throw e;
  } finally {
    // לדיבוג אפשר להשאיר פתוח
    // await browser.close().catch(() => {});
  }
}