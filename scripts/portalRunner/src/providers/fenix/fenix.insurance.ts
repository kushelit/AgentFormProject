import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { getPortalCreds } from "../../portalCredentials";
import { fenixLogin, fenixHandleOtp } from "./fenix.shared";

export async function runFenixInsurance(ctx: RunnerCtx) {
  const { runId, setStatus, env } = ctx;

  const portalUrl = env.FENIX_PORTAL_URL || "https://agent.fnx.co.il/my.policy";
  const headless = false;

  const agentId = String((ctx.run as any)?.agentId || ctx.agentId || "").trim();
  if (!agentId) throw new Error("Missing agentId");

  const creds = await getPortalCreds({ agentId, portalId: "fenix" });
  const username = creds.username;
  const password = creds.password;
  
  if (creds.requiresPassword && !password) {
    throw new Error("Missing password for fenix (portalCredentials)");
  }
  
  await setStatus(runId, { status: "running", step: "fenix_open_portal" });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    await page.goto(portalUrl, { waitUntil: "domcontentloaded" });

    await setStatus(runId, { status: "running", step: "fenix_login" });
    await fenixLogin(page, username, password!);

    await setStatus(runId, { status: "running", step: "fenix_otp" });
    await fenixHandleOtp(page, ctx);

    // POC הסתיים כאן — בהמשך נוסיף ניווט לדוחות/הורדה
    await setStatus(runId, { status: "running", step: "fenix_post_login_ready" });
    console.log("[Fenix] POC login completed");
  } finally {
    await browser.close().catch(() => {});
  }
}
