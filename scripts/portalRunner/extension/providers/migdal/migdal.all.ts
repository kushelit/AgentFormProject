// Ported from the native provider; browser report keys replace local files.
import { reportPath as path } from "../../report-store";
import { portalBrowser } from "../../browser";
import type { RunnerCtx } from "../../types";
import { migdalLogin, migdalHandleOtp, migdalOpenReport, migdalExportExcel, waitMigdalLoaderGone, navigateToCommissions, migdalReturnToAgreements, migdalClearModals } from "./migdal.shared";
import { uploadReport } from "../../report-store";
import { httpsCallable } from "firebase/functions";
async function getMigdalCredsViaCallable(ctx: RunnerCtx, portalId: string) {
    const functions = (ctx as any).functions;
    if (!functions)
        throw new Error("Missing ctx.functions");
    const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
    const res: any = await fn({ portalId });
    const s = (v: any) => String(v ?? "").trim();
    return {
        username: s(res?.data?.username),
        password: s(res?.data?.password),
        companyTaxId: s(res?.data?.companyTaxId)
    };
}
export async function runMigdalAll(ctx: RunnerCtx) {
    const { runId, setStatus, run, paths, storage } = ctx;
    const portalUrl = "https://apmaccess.migdal.co.il/my.policy/";
    const absDir = paths?.downloadsDir || "./downloads";
    const agentId = String((run as any)?.agentId || ctx.agentId || "").trim();
    const { username, password, companyTaxId } = await getMigdalCredsViaCallable(ctx, "migdal");
    await setStatus(runId, { status: "running", step: "migdal_open_portal" });
    const browser = await portalBrowser.launch();
    const context = await browser.newContext();
    // Let the authentication gateway load without response interception.
    await context.setResponseCaptureEnabled(false);
    const page = await context.newPage();
    await page.bringToFront().catch(() => { });
    try {
        await page.goto(portalUrl, { waitUntil: "commit", timeout: 60000 });
        await setStatus(runId, { status: "running", step: "migdal_login" });
        await migdalLogin(page, username, password!);
        await page.waitForTimeout(3000);
        await migdalHandleOtp(page, ctx);
        await page.waitForLoadState("networkidle").catch(() => { });
        await page.waitForURL(/NewEra/i, { timeout: 60000 });
        await waitMigdalLoaderGone(page);
        await migdalClearModals(page);
        await context.setResponseCaptureEnabled(true);
        await setStatus(runId, { status: "running", step: "מנווט לדוחות עמלות" });
        await navigateToCommissions(page);
        const REPORTS = [
            companyTaxId
                ? { name: "משולמים בעלים", templateId: "migdal_bealim" }
                : { name: "משולמים לסוכן", templateId: "migdal_insurance" },
            { name: "עמלה מדמי ניהול קהש וגמל - לבעלים", templateId: "migdal_gemel" },
            { name: "עמלה מצבירה/דמי ניהול לביטוח חיים לבעלים", templateId: "migdal_life" }
        ];
        const appendDownload = async (item: any) => {
            const cur = (ctx.run as any)?.downloads || [];
            const downloads = [...cur, item];
            (ctx.run as any).downloads = downloads;
            await setStatus(runId, { downloads });
        };
        let firstReportError: any;
        for (const rep of REPORTS) {
            try {
                await setStatus(runId, { status: "running", step: `מפיק דוח: ${rep.name}` });
                await migdalOpenReport(page, rep.name);
                await setStatus(runId, { status: 'running', step: `מייצא קובץ: ${rep.name}` });
                const download = await migdalExportExcel(page);
                if (download) {
                    const filename = download.suggestedFilename();
                    const reportKey = path.join(absDir, `${Date.now()}_${filename}`);
                    await download.saveAs(reportKey);
                    await setStatus(runId, { status: 'running', step: `מעלה קובץ: ${rep.name}` });
                    const up = await uploadReport({
                        storage, reportKey, agentId, runId, subdir: rep.templateId
                    } as any);
                    if (up?.storagePath) {
                        await appendDownload({
                            templateId: rep.templateId,
                            reportKey,
                            filename: up.filename || filename,
                            storagePath: up.storagePath
                        });
                    }
                }
                else {
                    throw new Error('MIGDAL_EXPORT_NOT_CAPTURED');
                }
                await setStatus(runId, { status: "running", step: `חוזר לתפריט הראשי...` });
                await migdalReturnToAgreements(page);
            }
            catch (repErr: any) {
                firstReportError ||= repErr;
                await migdalReturnToAgreements(page).catch(() => { });
            }
        }
        if (firstReportError) throw firstReportError;
        const totalDownloads = ((ctx.run as any)?.downloads || []).length;
        if (totalDownloads === 0) {
            await setStatus(runId, { status: "error", step: "migdal_done_no_files", error: { message: "No downloads[] / download.storagePath found" } });
            throw new Error("No downloads[] / download.storagePath found");
        }
        await setStatus(runId, { status: "done", step: "migdal_all_done" });
    }
    catch (e: any) {
        await setStatus(runId, { status: "error", error: e.message });
        throw e;
    }
    finally {
        await browser.close().catch(() => { });
    }
}
