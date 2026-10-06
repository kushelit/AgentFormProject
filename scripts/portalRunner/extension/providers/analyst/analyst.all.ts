// Ported from the native provider; browser report keys replace local files.
import { reportPath as path } from "../../report-store";
import { portalBrowser } from "../../browser";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { uploadReport } from "../../report-store";
import { analystLogin, analystHandleOtp, analystNavigateAndExport } from "./analyst.shared";
function s(v: any) {
    return String(v ?? "").trim();
}
async function getAnalystCreds(ctx: RunnerCtx) {
    const functions = (ctx as any).functions;
    const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
    const res: any = await fn({ portalId: "analyst" });
    return {
        username: s(res?.data?.username),
        phoneNumber: s(res?.data?.phoneNumber),
    };
}
export async function runAnalystAll(ctx: RunnerCtx) {
    const { runId, setStatus, run, paths, storage } = ctx;
    const portalUrl = "https://agent.analyst.co.il/auth/login";
    const absDir = s(paths?.downloadsDir || "./downloads");
    const monthLabel = (run.resolvedWindow?.kind === "month"
        ? (run.resolvedWindow.label || run.monthLabel)
        : run.resolvedWindow?.label) || "חודש נוכחי";
    const agentId = s((run as any)?.agentId || ctx.agentId);
    const { username, phoneNumber } = await getAnalystCreds(ctx);
    const appendDownload = async (item: any) => {
        const cur = (ctx.run as any)?.downloads || [];
        const downloads = Array.isArray(cur) ? [...cur, item] : [item];
        (ctx.run as any).downloads = downloads;
        await setStatus(runId, { downloads });
    };
    await setStatus(runId, { status: "running", step: "analyst_open_portal", monthLabel });
    const context = await portalBrowser.launchPersistentContext("");
    const page = context.pages()[0] || await context.newPage();
    await page.bringToFront();
    try {
        await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => { });
        await setStatus(runId, { status: "running", step: "מבצע לוגין לאנליסט", monthLabel });
        await analystLogin(page, username, phoneNumber);
        await analystHandleOtp(page, ctx);
        await setStatus(runId, { status: "running", step: "מוריד דוח מאנליסט", monthLabel });
        const downloads = await analystNavigateAndExport(page, absDir);
        if (downloads.length > 0) {
            for (const { reportKey, filename, templateId: repTemplateId } of downloads) {
                const up = await uploadReport({
                    storage,
                    reportKey,
                    agentId,
                    runId,
                    subdir: repTemplateId,
                } as any);
                if (up?.storagePath) {
                    await appendDownload({
                        templateId: repTemplateId,
                        reportKey,
                        filename: up.filename || filename,
                        storagePath: up.storagePath,
                    });
                }
            }
            await setStatus(runId, {
                status: "done",
                step: "analyst_done",
                monthLabel,
                result: { uploaded: true },
            });
        }
        else {
            await setStatus(runId, { status: "error", step: "analyst_done_no_files", error: { message: "No downloads[] / download.storagePath found" }, monthLabel });
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
