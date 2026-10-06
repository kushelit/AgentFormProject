// Ported from the native provider; browser report keys replace local files.
import { reportPath as path } from "../../report-store";
import { portalBrowser } from "../../browser";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { uploadReport } from "../../report-store";
import { morLogin, morHandleOtp, morNavigateToReport, morNavigateToVolumeReport } from "./mor.shared";
function s(v: any) {
    return String(v ?? "").trim();
}
async function getMorCreds(ctx: RunnerCtx) {
    const functions = (ctx as any).functions;
    const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
    const res: any = await fn({ portalId: "mor" });
    return {
        licenseNumber: s(res?.data?.licenseNumber),
        username: s(res?.data?.username),
        phoneNumber: s(res?.data?.phoneNumber),
    };
}
export async function runMorAll(ctx: RunnerCtx) {
    const { runId, setStatus, run, paths, storage } = ctx;
    const portalUrl = "https://join.more.co.il/agentsportal/agents/login";
    const absDir = s(paths?.downloadsDir || "./downloads");
    const monthLabel = (run.resolvedWindow?.kind === "month"
        ? (run.resolvedWindow.label || run.monthLabel)
        : run.resolvedWindow?.label) || "חודש נוכחי";
    const agentId = s((run as any)?.agentId || ctx.agentId);
    const { licenseNumber, username, phoneNumber } = await getMorCreds(ctx);
    await setStatus(runId, { status: "running", step: "mor_open_portal", monthLabel });
    const context = await portalBrowser.launchPersistentContext("");
    const page = context.pages()[0] || await context.newPage();
    await page.bringToFront();
    try {
        await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForSelector('input[formcontrolname="licenseId"]', {timeout:30000});
        const cdp = await page.context().newCDPSession(page);
        const cdpCheck = await cdp.send("Runtime.evaluate", {
            expression: `document.querySelectorAll('*').length`,
            returnByValue: true,
        });
        await setStatus(runId, { status: "running", step: "מבצע לוגין למור", monthLabel });
        await morLogin(page, licenseNumber, username, phoneNumber);
        await morHandleOtp(page, ctx);
        await setStatus(runId, { status: "running", step: "מנסה לנווט לדוח", monthLabel });
        const requestedReportMonth = String((run as any)?.requestedReportMonth || '').trim() || undefined;
        const download = await morNavigateToReport(page, requestedReportMonth);
        const appendDownload = async (item: any) => {
            const cur = (ctx.run as any)?.downloads || [];
            const downloads = Array.isArray(cur) ? [...cur, item] : [item];
            (ctx.run as any).downloads = downloads;
            await setStatus(runId, { downloads });
        };
        if (download) {
            const filename = download.suggestedFilename();
            const reportKey = path.join(absDir, `${Date.now()}_${filename}`);
            await download.saveAs(reportKey);
            await setStatus(runId, {status:'running',step:'mor_uploading_report'});
            const up = await uploadReport({
                storage, reportKey, agentId, runId, subdir: "mor_insurance",
            } as any);
            if (up?.storagePath) {
                await appendDownload({
                    templateId: "mor_insurance",
                    reportKey,
                    filename: up.filename || filename,
                    storagePath: up.storagePath,
                });
            }
        }
        const totalDownloads = ((ctx.run as any)?.downloads || []).length;
        if (totalDownloads === 0) {
            await setStatus(runId, { status: "error", step: "mor_done_no_files", error: { message: "No downloads[] / download.storagePath found" }, monthLabel });
            throw new Error("No downloads[] / download.storagePath found");
        }
        await setStatus(runId, { status: "done", step: "mor_done", monthLabel, result: { uploaded: true } });
    }
    catch (e: any) {
        await setStatus(runId, { status: "error", error: e.message, monthLabel });
        throw e;
    }
    finally {
        await context.close().catch(() => { });
    }
}
