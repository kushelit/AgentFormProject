// Ported from the native provider; browser report keys replace local files.
import { reportPath as path } from "../../report-store";
import { portalBrowser } from "../../browser";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { uploadReport } from "../../report-store";
import { altshulerLogin, altshulerHandleOtp, altshulerNavigateAndExport } from "./altshuler.shared";
function s(v: any) {
    return String(v ?? "").trim();
}
async function getAltshulerCreds(ctx: RunnerCtx) {
    const functions = (ctx as any).functions;
    const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
    const res: any = await fn({ portalId: "altshuler" });
    return {
        companyId: s(res?.data?.licenseNumber),
        idNumber: s(res?.data?.username),
        loginType: s(res?.data?.loginType) || "company",
    };
}
export async function runAltshulerAll(ctx: RunnerCtx) {
    const { runId, setStatus, run, paths, storage } = ctx;
    const portalUrl = "https://agents.as-invest.co.il/Login";
    const absDir = s(paths?.downloadsDir || "./downloads");
    const monthLabel = (run.resolvedWindow?.kind === "month"
        ? (run.resolvedWindow.label || run.monthLabel)
        : run.resolvedWindow?.label) || "חודש נוכחי";
    const agentId = s((run as any)?.agentId || ctx.agentId);
    const { companyId, idNumber, loginType } = await getAltshulerCreds(ctx);
    const appendDownload = async (item: any) => {
        const cur = (ctx.run as any)?.downloads || [];
        const downloads = Array.isArray(cur) ? [...cur, item] : [item];
        (ctx.run as any).downloads = downloads;
        await setStatus(runId, { downloads });
    };
    await setStatus(runId, { status: "running", step: "altshuler_open_portal", monthLabel });
    const context = await portalBrowser.launchPersistentContext("");
    const page = context.pages()[0] || await context.newPage();
    await page.bringToFront();
    try {
        await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => { });
        await setStatus(runId, { status: "running", step: "מבצע לוגין לאלטשולר", monthLabel });
        await altshulerLogin(page, companyId, idNumber, loginType);
        await altshulerHandleOtp(page, ctx);
        await setStatus(runId, { status: "running", step: "מוריד דוח מאלטשולר", monthLabel });
        const requestedReportMonth = String((run as any)?.requestedReportMonth || '').trim() || undefined;
        const downloads = await altshulerNavigateAndExport(page, absDir, requestedReportMonth);
        if (downloads.length > 0) {
            for (const { reportKey, filename } of downloads) {
                const up = await uploadReport({
                    storage,
                    reportKey,
                    agentId,
                    runId,
                    subdir: "altshuler_insurance",
                } as any);
                if (up?.storagePath) {
                    await appendDownload({
                        templateId: "altshuler_insurance",
                        reportKey,
                        filename: up.filename || filename,
                        storagePath: up.storagePath,
                    });
                }
            }
            await setStatus(runId, {
                status: "done",
                step: "altshuler_done",
                monthLabel,
                result: { uploaded: true },
            });
        }
        else {
            await setStatus(runId, { status: "error", step: "altshuler_done_no_files", error: { message: "No downloads[] / download.storagePath found" }, monthLabel });
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
