// Ported from the native provider; browser report keys replace local files.
import { reportPath as path } from "../../report-store";
import { portalBrowser } from "../../browser";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { uploadReport } from "../../report-store";
import { harelLogin, harelHandleOtp, harelNavigateToReport, harelNavigateToTzviraReport, } from "./harel.shared";
function s(v: any) {
    return String(v ?? "").trim();
}
async function getHarelCreds(ctx: RunnerCtx) {
    const functions = (ctx as any).functions;
    const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
    const res: any = await fn({ portalId: "harel" });
    return {
        username: s(res?.data?.username),
        password: s(res?.data?.password),
    };
}
export async function runHarelAll(ctx: RunnerCtx) {
    const { runId, setStatus, run, paths, storage } = ctx;
    const portalUrl = "https://agents.harel-group.co.il/my.policy";
    const absDir = s(paths?.downloadsDir || "./downloads");
    const monthLabel = (run.resolvedWindow?.kind === "month"
        ? (run.resolvedWindow.label || run.monthLabel)
        : run.resolvedWindow?.label) || "חודש נוכחי";
    const agentId = s((run as any)?.agentId || ctx.agentId);
    const { username, password } = await getHarelCreds(ctx);
    const appendDownload = async (item: any) => {
        const cur = (ctx.run as any)?.downloads || [];
        const downloads = Array.isArray(cur) ? [...cur, item] : [item];
        (ctx.run as any).downloads = downloads;
        await setStatus(runId, { downloads });
    };
    await setStatus(runId, { status: "running", step: "harel_open_portal", monthLabel });
    const context = await portalBrowser.launchPersistentContext("");
    const page = context.pages()[0] || await context.newPage();
    await page.bringToFront();
    const REPORTS = [
        {
            templateId: "harel_insurance",
            stepPrefix: "harel_insurance",
            label: "נפרעים",
            fn: () => harelNavigateToReport(page, absDir),
        },
        {
            templateId: "harel_tzvira",
            stepPrefix: "harel_tzvira",
            label: "צבירה",
            fn: () => harelNavigateToTzviraReport(page, absDir, ctx),
        },
    ];
    try {
        await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => { });
        await setStatus(runId, { status: "running", step: "מבצע לוגין להראל", monthLabel });
        await harelLogin(page, username, password);
        await harelHandleOtp(page, ctx);
        for (const rep of REPORTS) {
            try {
                await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_start`, monthLabel });
                const downloads = await rep.fn();
                for (const { reportKey, filename } of downloads) {
                    const up = await uploadReport({
                        storage,
                        reportKey,
                        agentId,
                        runId,
                        subdir: rep.templateId,
                    } as any);
                    if (up?.storagePath) {
                        await appendDownload({
                            templateId: rep.templateId,
                            reportKey,
                            filename: up.filename || filename,
                            storagePath: up.storagePath,
                        });
                    }
                }
                await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_done`, monthLabel });
            }
            catch (err: any) {
                await setStatus(runId, {
                    status: "running",
                    step: `${rep.stepPrefix}_failed`,
                    error: err.message,
                    monthLabel,
                });
            }
        }
        const totalDownloads = ((ctx.run as any)?.downloads || []).length;
        if (totalDownloads === 0) {
            await setStatus(runId, { status: "error", step: "harel_done_no_files", error: { message: "No downloads[] / download.storagePath found" }, monthLabel });
            throw new Error("No downloads[] / download.storagePath found");
        }
        await setStatus(runId, {
            status: "done",
            step: "harel_all_done",
            monthLabel,
            result: { uploaded: true },
        });
    }
    catch (e: any) {
        await setStatus(runId, { status: "error", error: e.message, monthLabel });
        throw e;
    }
    finally {
        await context.close().catch(() => { });
    }
}
