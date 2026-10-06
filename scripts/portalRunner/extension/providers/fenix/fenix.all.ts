// Ported from the native provider; browser report keys replace local files.
import { reportPath as path } from "../../report-store";
import { portalBrowser, Browser, BrowserContext, Page, Download } from "../../browser";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { uploadReport } from "../../report-store";
import { phoenixLogin, phoenixHandleOtp, navigateToPhoenixCommissions, navigateToPhoenixPaymentsSummary, phoenixSearchAndSelectCompany, phoenixOpenReportByMatch, phoenixExportExcel, handleFenixLoginRedirect, waitPhoenixLoaderGone } from "./fenix.shared";
function s(v: any) { return String(v ?? "").trim(); }
async function getPhoenixCreds(ctx: RunnerCtx, portalId: string) {
    const functions = (ctx as any).functions;
    const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
    const res: any = await fn({ portalId });
    return {
        username: s(res?.data?.username),
        password: s(res?.data?.password),
        companyTaxId: s(res?.data?.companyTaxId)
    };
}
export async function runPhoenixAll(ctx: RunnerCtx) {
    const { runId, setStatus, run, paths, storage, log } = ctx;
    const portalUrl = "https://agent.fnx.co.il/";
    const absDir = s(paths!.downloadsDir || "./downloads");
    const agentId = s(run.agentId || ctx.agentId);
    const { username, password, companyTaxId } = await getPhoenixCreds(ctx, "fenix");
    const monthLabel = run.monthLabel || "חודש נוכחי";
    const useCompanySearch = Boolean(companyTaxId);
    await setStatus(runId, { status: "running", step: "מאתחל דפדפן לפניקס...", monthLabel });
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    try {
        browser = await portalBrowser.launch();
        context = await browser.newContext();
        const page: Page = await context.newPage();
        await page.bringToFront().catch(() => { });
        log!.info(`[Fenix] Navigating to: ${portalUrl}`);
        await page.goto(portalUrl, { waitUntil: "networkidle", timeout: 90000 }).catch(() => { });
        await page.waitForTimeout(5000);
        await setStatus(runId, { status: "running", step: "מבצע כניסה...", monthLabel });
        await phoenixLogin(page, username, password);
        await phoenixHandleOtp(page, ctx);
        await setStatus(runId, { status: "running", step: "עובר לאזור העמלות...", monthLabel });
        await navigateToPhoenixCommissions(page);
        await setStatus(runId, { status: "running", step: "עובר לריכוז תשלומי עמלות...", monthLabel });
        await navigateToPhoenixPaymentsSummary(page);
        if (useCompanySearch) {
            await setStatus(runId, { status: "running", step: "מאתר סוכנות לפי ח.פ...", monthLabel });
            await phoenixSearchAndSelectCompany(page, companyTaxId);
        }
        type ReportDef = {
            name: string;
            templateId: string;
            subdir: string;
            include: string[];
            exclude?: string[];
            exact?: string;
        };
        const REPORTS: ReportDef[] = [
            {
                name: "נפרעים",
                templateId: "fenix_insurance",
                subdir: "insurance",
                exact: "נפרעים",
                include: ["נפרעים"],
                exclude: ["גמל", "סוכנויות", "רטרו"]
            },
            {
                name: "נפרעים והפרשי סוכנויות גמל",
                templateId: "fenix_gemel",
                subdir: "gemel",
                exact: "נפרעים (והפרשי סוכנויות)גמל",
                include: ["נפרעים", "גמל"],
                exclude: ["רטרו"]
            }
        ];
        if (useCompanySearch) {
            REPORTS.push({
                name: "הפרשי סוכנויות נפרעים",
                templateId: "fenix_hefreshim",
                subdir: "hefreshim",
                exact: "הפרש סוכנויות (נפרעים)",
                include: ["סוכנויות", "נפרעים"],
                exclude: ["גמל", "רטרו"]
            });
        }
        const appendDownload = async (item: any) => {
            const cur = (run as any).downloads || [];
            const downloads = [...cur, item];
            (run as any).downloads = downloads;
            await setStatus(runId, { downloads });
        };
        for (const rep of REPORTS) {
            try {
                await setStatus(runId, { status: "running", step: `מפיק דוח: ${rep.name}`, monthLabel });
                const reportPage = await phoenixOpenReportByMatch(page, { include: rep.include, exclude: rep.exclude, exact: rep.exact });
                const download = await phoenixExportExcel(reportPage, log);
                if (download) {
                    const filename = download.suggestedFilename();
                    const reportKey = path.join(absDir, `${Date.now()}_${filename}`);
                    await download.saveAs(reportKey);
                    const up = await uploadReport({ storage, reportKey, agentId, runId, subdir: rep.subdir } as any);
                    if (up?.storagePath) {
                        await appendDownload({ templateId: rep.templateId, filename: up.filename || filename, storagePath: up.storagePath });
                    }
                }
                if (reportPage !== page) {
                    await reportPage.close().catch(() => { });
                }
                await page.bringToFront();
                await page.waitForTimeout(1500);
            }
            catch (err: any) {
                log!.error(`[Fenix] Error in report ${rep.name}: ${err.message}`);
            }
        }
        const expectedTemplateIds = REPORTS.map(r => r.templateId);
        const downloadedTemplateIds = ((run as any).downloads || []).map((d: any) => d.templateId);
        const missingTemplateIds = expectedTemplateIds.filter(id => !downloadedTemplateIds.includes(id));
        if (missingTemplateIds.length) {
            await setStatus(runId, {
                missingReports: missingTemplateIds.map(templateId => ({
                    templateId,
                    reason: "no_data_or_no_button",
                }))
            });
        }
        const totalDownloads = ((run as any)?.downloads || []).length;
        if (totalDownloads === 0) {
            await setStatus(runId, { status: "error", step: "fenix_done_no_files", error: { message: "No downloads[] / download.storagePath found" }, monthLabel });
            throw new Error("No downloads[] / download.storagePath found");
        }
        await setStatus(runId, { status: "done", step: "הסתיים בהצלחה", monthLabel });
    }
    catch (e: any) {
        log!.error("[Fenix] Global error:", e.message);
        await setStatus(runId, { status: "error", error: { message: e.message } });
    }
    finally {
        if (context)
            await context.close().catch(() => { });
        if (browser)
            await browser.close().catch(() => { });
    }
}
