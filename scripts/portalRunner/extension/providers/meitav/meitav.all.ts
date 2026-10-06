// Ported from the native provider; browser report keys replace local files.
import { reportPath as path } from "../../report-store";
import { portalBrowser } from "../../browser";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { uploadReport } from "../../report-store";
import { meitavLogin, meitavHandleOtp, meitavNavigateAndExport } from "./meitav.shared";
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
async function getMeitavAgentCodeIncludeList(ctx: RunnerCtx): Promise<string[]> {
    const functions = (ctx as any).functions;
    const fn = httpsCallable(functions, "getPortalAgentCodeIncludeList");
    const res: any = await fn({ portalId: "meitav" });
    const raw = Array.isArray(res?.data?.includeCodes) ? res.data.includeCodes : [];
    return raw.map((c: any) => String(c).trim()).filter(Boolean);
}
export async function runMeitavAll(ctx: RunnerCtx) {
    const { runId, setStatus, run, paths, storage } = ctx;
    const portalUrl = "https://www.meitav.co.il/agents_home_page/";
    const absDir = s(paths?.downloadsDir || "./downloads");
    const monthLabel = (run.resolvedWindow?.kind === "month"
        ? (run.resolvedWindow.label || run.monthLabel)
        : run.resolvedWindow?.label) || "חודש נוכחי";
    const agentId = s((run as any)?.agentId || ctx.agentId);
    const { username, phoneNumber } = await getMeitavCreds(ctx);
    const includeCodes = await getMeitavAgentCodeIncludeList(ctx);
    const appendDownload = async (item: any) => {
        const cur = (ctx.run as any)?.downloads || [];
        const downloads = Array.isArray(cur) ? [...cur, item] : [item];
        (ctx.run as any).downloads = downloads;
        await setStatus(runId, { downloads });
    };
    await setStatus(runId, { status: "running", step: "meitav_open_portal", monthLabel });
    const context = await portalBrowser.launchPersistentContext("");
    const page = context.pages()[0] || await context.newPage();
    await page.bringToFront();
    try {
        await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => { });
        const cdp = await page.context().newCDPSession(page);
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
            await page.goto("https://customers.meitav.co.il/v2/login/LoginAgent", { waitUntil: "domcontentloaded", timeout: 30000 });
            loginPage2 = page;
        }
        await loginPage2.bringToFront();
        await loginPage2.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => { });
        await loginPage2.waitForTimeout(3000);
        await setStatus(runId, { status: "running", step: "מבצע לוגין למיטב", monthLabel });
        await meitavLogin(loginPage2, username, phoneNumber);
        await meitavHandleOtp(loginPage2, ctx);
        await loginPage2.waitForTimeout(10000);
        await setStatus(runId, { status: "running", step: "מנסה לנווט לדוח עמלות", monthLabel });
        const requestedReportMonth = String((run as any)?.requestedReportMonth || '').trim() || undefined;
        const downloads = await meitavNavigateAndExport(loginPage2, absDir, requestedReportMonth, includeCodes);
        const successDownloads = downloads.filter(d => !d.failed);
        const failedDownloads = downloads.filter(d => d.failed);
        if (successDownloads.length > 0) {
            for (const { reportKey, filename, agentName } of successDownloads) {
                const up = await uploadReport({
                    storage,
                    reportKey,
                    agentId,
                    runId,
                    subdir: "meitav_insurance",
                } as any);
                if (up?.storagePath) {
                    await appendDownload({
                        templateId: "meitav_insurance",
                        reportKey,
                        filename: up.filename || filename,
                        storagePath: up.storagePath,
                        agentName,
                    });
                }
                else {
                }
            }
            await setStatus(runId, {
                status: "done",
                step: "meitav_done",
                monthLabel,
                result: { uploaded: true, count: successDownloads.length },
                ...(failedDownloads.length > 0 ? {
                    missingAgents: failedDownloads.map(d => ({ agentName: d.agentName, reason: d.failReason }))
                } : {}),
            });
        }
        else if (downloads.length === 0) {
            await setStatus(runId, { status: "error", step: "meitav_done_no_files", error: { message: "No downloads[] / download.storagePath found" }, monthLabel });
            throw new Error("No downloads[] / download.storagePath found");
        }
    }
    catch (e: any) {
        await setStatus(runId, { status: "error", error: e.message, monthLabel });
        throw e;
    }
    finally {
        await context.close().catch(() => { });
    }
}
