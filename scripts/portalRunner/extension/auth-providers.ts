import type { Page } from './browser';
import type { RunnerCtx } from './types';
import { waitForPortalAuthentication } from './auth-flow';

type Rule = {hosts:string[]; challenge:string; success:string; text?:string; path?:string};
export const authenticationRules: Record<string,Rule> = {
  clal:{hosts:['clalnet.co.il','clalbit.co.il'],challenge:'input[name="Token"]',success:'a[href*="Logout"], a[href*="logout"], #moduleHeaderSpan'},
  migdal:{hosts:['migdal.co.il'],challenge:'#input_2',success:'#goToHome',text:'כלים'},
  fenix:{hosts:['fnx.co.il'],challenge:'#input_2',success:'button[aria-label="עמלות"], a[href*="payments-report"]',text:'עמלות'},
  menora:{hosts:['menora.co.il'],challenge:'input#username, input[id^="otp-input"], input[name*="otp"], .otp-field input',success:'a.logo[href*="agents-site"], .user-profile, [class*="dashboard"]'},
  harel:{hosts:['harel-group.co.il'],challenge:'#input_1, input[name="otpass"]',success:'a[href*="logout"], a[href*="Logout"]',path:'^/Information/'},
  ayalon:{hosts:['ayalon-ins.co.il'],challenge:'#input_2',success:'a[href*="/reports/"]'},
  mor:{hosts:['more.co.il'],challenge:'input[formcontrolname="otpCode"], input[formcontrolname="licenseId"]',success:'ul.k-drawer-items li.k-drawer-item, li[aria-label*="חישוב תגמול"]'},
  meitav:{hosts:['meitav.co.il'],challenge:'#codeDigitsInput, input[name="codeDigitsInput"]',success:'a.lnkLogOut'},
  analyst:{hosts:['analyst.co.il'],challenge:'.hidden-otp-input, input[type="password"]',success:'a[href="/reports"]'},
  altshuler:{hosts:['as-invest.co.il'],challenge:'input.login-new-input-field',success:'.nav-items, nav[role="navigation"]'},
  hachshara:{hosts:['agents.hcsra.co.il'],challenge:'input[name="text"], input[type="password"]',success:'#btn-submit, a[href*="logout"], a[href*="Logout"]'},
  yalinlapidot:{hosts:['yl-invest.co.il'],challenge:'input[name="code"], input[name="mobileNumber"]',success:'span.nav-link-text',text:'צפיה בדוח עמלות'},
  infinity:{hosts:['optimus-agent.malam-payroll.com'],challenge:'[data-vv-as="קוד"]',success:'a[href*="logout"], a[href*="Logout"], button[aria-label="יציאה"], button[aria-label="התנתק"]'},
};

export async function providerAuthenticated(page: Page, provider: string) {
  const rule=authenticationRules[provider];
  if (!rule) throw new Error('UNKNOWN_AUTHENTICATION_PROVIDER');
  const inspect = (rule: Rule) => {
    if (!rule.hosts.some(host=>location.hostname===host || location.hostname.endsWith('.'+host))) return false;
    const visible = (el: Element) => !!el.getClientRects().length && getComputedStyle(el).visibility!=='hidden';
    if (Array.from(document.querySelectorAll(rule.challenge)).some(visible)) return false;
    if (rule.path && new RegExp(rule.path,'i').test(location.pathname)) return true;
    const candidates=Array.from(document.querySelectorAll(rule.success));
    if (candidates.some(el=>visible(el) && (!rule.text || (el.textContent || '').trim().includes(rule.text)))) return true;
    if (rule.text && Array.from(document.querySelectorAll('a,button,label,span.item-label')).some(el=>
      visible(el) && (el.textContent || '').trim()===rule.text)) return true;
    // A real sign-out control also supports future portal landing-page changes.
    return Array.from(document.querySelectorAll('a[href],button[aria-label]')).some(el=>visible(el) &&
      (/logout|signout/i.test(el.getAttribute('href') || '') || /^(יציאה|התנתק)$/.test(el.getAttribute('aria-label') || '')));
  };
  if (await page.evaluate(inspect,rule).catch(()=>false)) return true;
  for (const frame of page.frames()) {
    if (await frame.evaluate(inspect,rule).catch(()=>false)) return true;
  }
  return false;
}
export const waitForProviderAuthentication = (page:Page,ctx:RunnerCtx,provider:string) =>
  waitForPortalAuthentication(page,ctx,()=>providerAuthenticated(page,provider));
export async function continueIfAuthenticated(page:Page,ctx:RunnerCtx,provider:string) {
  if (!await providerAuthenticated(page,provider)) return false;
  await ctx.clearOtp(ctx.runId);
  await ctx.setStatus(ctx.runId,{status:'running',step:'portal_authentication_confirmed','otp.state':'none','otp.value':''});
  return true;
}
