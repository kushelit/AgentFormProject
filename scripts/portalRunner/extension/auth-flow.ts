import type { Page } from './browser';
import type { RunnerCtx } from './types';

export async function waitForPortalAuthentication(page: Page, ctx: RunnerCtx,
  authenticated: () => Promise<boolean>, timeout = 180000): Promise<{kind:'authenticated'} | {kind:'otp';code:string}> {
  const deadline = Date.now()+timeout;
  while (Date.now()<deadline) {
    // Positive portal-specific proof is required; disappearance of OTP alone
    // can also mean an expired session or an error page.
    if (await authenticated()) {
      await ctx.clearOtp(ctx.runId);
      await ctx.setStatus(ctx.runId,{status:'running',step:'portal_authentication_confirmed','otp.state':'none','otp.value':''});
      return {kind:'authenticated'};
    }
    if (!ctx.readOtp) return {kind:'otp',code:await ctx.pollOtp(ctx.runId,timeout)};
    const code = await ctx.readOtp(ctx.runId);
    if (code) {
      if (await authenticated()) continue;
      return {kind:'otp',code};
    }
    await page.waitForTimeout(1000);
  }
  throw new Error('OTP_TIMEOUT');
}
