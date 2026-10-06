// Ported from the native provider; browser report keys replace local files.
import { reportPath as path } from "../../report-store";
import { portalBrowser, BrowserContext, Browser } from "../../browser";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { clalLogin, clalHandleOtp, gotoCommissionsPage, clickSearchOnly, waitForCommissionsGridFilled, openAgentsDropdownAndSelectAll, exportExcelFromCurrentReport, openReportFromSummaryByName, clickReportTabHeading, waitClalLoaderGone } from "./clal.shared";
import { uploadReport } from "../../report-store";
function s(v: any) {
    return String(v ?? "").trim();
}
async function getClalCredsViaCallable(ctx: RunnerCtx, portalId: string) {
    const functions = (ctx as any).functions;
    if (!functions)
        throw new Error("Missing ctx.functions");
    const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
    const res: any = await fn({ portalId });
    return {
        username: s(res?.data?.username),
        password: s(res?.data?.password),
        companyTaxId: s(res?.data?.companyTaxId)
    };
}
export async function runClalAll(ctx: RunnerCtx) {
    const { runId, setStatus, run } = ctx;
    const portalUrl = "https://www.clalnet.co.il/";
    const agentId = s((ctx.run as any)?.agentId || ctx.agentId);
    const storage = (ctx as any).storage;
    const absDir = s(ctx.paths?.downloadsDir);
    const { username, password, companyTaxId } = await getClalCredsViaCallable(ctx, "clal");
    const monthLabel = (run.resolvedWindow?.kind === "month" ? (run.resolvedWindow.label || run.monthLabel) : run.resolvedWindow?.label) || "חודש נוכחי";
    const appendDownload = async (item: any) => {
        const cur = (ctx.run as any)?.downloads || [];
        const downloads = Array.isArray(cur) ? [...cur, item] : [item];
        (ctx.run as any).downloads = downloads;
        await setStatus(runId, { downloads });
    };
    await setStatus(runId, { status: "running", step: "clal_open_portal", monthLabel });
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    try {
        browser = await portalBrowser.launch();
        context = await browser.newContext();
        const page = await context.newPage();
        await page.bringToFront().catch(() => { });
        await setStatus(runId, { status: "running", step: " Navigating to portal", monthLabel });
        await page.goto(portalUrl, { waitUntil: "commit", timeout: 60000 });
        await setStatus(runId, { status: "running", step: " Logging in", monthLabel });
        await clalLogin(page, username, password);
        await setStatus(runId, {
            status: "otp_required",
            step: "ממתין להזנת קוד אימות מחברת כלל",
            'otp.mode': 'firestore',
            monthLabel
        });
        await clalHandleOtp(page, ctx);
        await setStatus(runId, { status: "running", step: "Navigating to commissions page", monthLabel });
        const commissionsPage = await gotoCommissionsPage(page);
        await setStatus(runId, { status: "running", step: " Stabilizing commissions page", monthLabel });
        await commissionsPage.waitForTimeout(4000);
        await waitClalLoaderGone(commissionsPage, 5000);
        await setStatus(runId, { status: "running", step: " Selecting agents", monthLabel });
        await openAgentsDropdownAndSelectAll(commissionsPage, companyTaxId);
        await clickSearchOnly(commissionsPage);
        await waitForCommissionsGridFilled(commissionsPage, 30000);
        const REPORTS: any[] = [
            { linkText: "חיים", templateId: "clal_life", stepPrefix: "clal_life", preExportTabHeading: "פוליסה" },
            { linkText: "גמל", templateId: "clal_gemel", stepPrefix: "clal_gemel", preExportTabHeading: "עמיתים" },
            { linkText: "פנסיה", templateId: "clal_pensia", stepPrefix: "clal_pensia", preExportTabHeading: "עמיתים" },
            { linkText: "בריאות", templateId: "clal_briut", stepPrefix: "clal_briut", preExportTabHeading: "פוליסות" },
        ];
        for (const rep of REPORTS) {
            try {
                await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_open` });
                await openReportFromSummaryByName(commissionsPage, rep.linkText);
                await waitClalLoaderGone(commissionsPage, 10000);
                await commissionsPage.waitForTimeout(1000);
                if (rep.preExportTabHeading) {
                    await clickReportTabHeading(commissionsPage, rep.preExportTabHeading);
                }
                const gridResult = await waitForCommissionsGridFilled(commissionsPage, 45000);
                if (gridResult === "TIMEOUT" || gridResult === "NO_DATA") {
                    await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_skipped` });
                    continue;
                }
                await commissionsPage.waitForTimeout(1000);
                const { download, filename } = await exportExcelFromCurrentReport(commissionsPage);
                if (download) {
                    const reportKey = path.join(absDir, `${Date.now()}_${filename}`);
                    await download.saveAs(reportKey);
                    const up = await uploadReport({
                        storage,
                        reportKey,
                        agentId,
                        runId,
                        subdir: rep.templateId
                    } as any);
                    if (up && up.storagePath) {
                        await appendDownload({
                            templateId: rep.templateId,
                            reportKey,
                            filename: up.filename || filename,
                            storagePath: up.storagePath
                        });
                        await setStatus(runId, { status: "file_uploaded", step: `${rep.stepPrefix}_done` });
                    }
                }
                else {
                }
            }
            catch (err: any) {
                await setStatus(runId, { status: "running", step: `${rep.stepPrefix}_failed`, error: err.message });
            }
        }
        const totalDownloads = ((ctx.run as any)?.downloads || []).length;
        if (totalDownloads === 0) {
            await setStatus(runId, { status: "error", step: "clal_done_no_files", error: { message: "No downloads[] / download.storagePath found" }, monthLabel });
            throw new Error("No downloads[] / download.storagePath found");
        }
        await setStatus(runId, { status: "done", step: "clal_all_done", monthLabel, result: { uploaded: true } });
    }
    catch (e: any) {
        if (context && context.pages().length > 0) {
            const p = context.pages()[context.pages().length - 1];
            const screenshotPath = path.join(s(ctx.paths?.logsDir), `error_${Date.now()}.png`);
            await p.screenshot({ path: screenshotPath }).catch(() => { });
        }
        throw e;
    }
    finally {
        if (browser)
            await browser.close().catch(() => { });
    }
}
