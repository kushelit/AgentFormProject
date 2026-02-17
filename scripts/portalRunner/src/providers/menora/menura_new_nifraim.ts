// scripts/portalRunner/src/providers/menora/menora.new_nifraim.ts
import { chromium } from "playwright";
import type { RunnerCtx } from "../../types";
import { getPortalCreds } from "../../portalCredentials";
import {
  menoraFillUsername,
  menoraFillPhoneAndApprove,
  menoraHandleOtp,
  menoraEnsureLoggedIn,
} from "./menora.shared";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function runMenoraNewNifraim(ctx: RunnerCtx) {
  const { runId, setStatus, env } = ctx;

  const portalUrl = s(env.MENORA_PORTAL_URL) || "https://menoranet.menora.co.il/";
  const headless = false;

  const agentId = s((ctx.run as any)?.agentId || ctx.agentId);
  if (!agentId) throw new Error("Missing agentId");

  // ✅ חשוב: עקבי עם portalId במסך הקרדנצ'יאלס וב-company.portalId
  const portalId = "menora";

  const creds = await getPortalCreds({ agentId, portalId });

  const username = s(creds.username);
  const phoneNumber = s((creds as any).phoneNumber) || s(env.MENORA_PHONE_NUMBER);

  // מנורה: אין password קבוע
  if (!username) throw new Error("Menora missing username");
  if (!phoneNumber) {
    throw new Error(
      "Menora missing phoneNumber (save it in portal credentials OR set MENORA_PHONE_NUMBER env)"
    );
  }

  await setStatus(runId, { status: "running", step: "menora_open_portal" });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true, // ✅ חשוב להמשך Export
  });
  const page = await context.newPage();

  try {
    await page.goto(portalUrl, { waitUntil: "domcontentloaded" });

    await setStatus(runId, { status: "running", step: "menora_fill_username" });
    await menoraFillUsername(page, username);

    await setStatus(runId, { status: "running", step: "menora_fill_phone_and_approve" });
    await menoraFillPhoneAndApprove(page, phoneNumber);

    await setStatus(runId, { status: "running", step: "menora_otp" });
    // ✅ menoraHandleOtp כבר מסמן logged_in כשנכנסנו (או במצב manual אחרי שמופיע logo)
    await menoraHandleOtp(page, ctx);

    await setStatus(runId, { status: "running", step: "menora_verify_inside" });
    await menoraEnsureLoggedIn(page);

    await setStatus(runId, { status: "running", step: "menora_post_login_ready" });
  } finally {
    await browser.close().catch(() => {});
  }
}
