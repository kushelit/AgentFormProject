// Ported from the native provider; browser report keys replace local files.
import { reportPath as path } from "../../report-store";
import { portalBrowser, Browser, BrowserContext, Page } from "../../browser";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { uploadReport } from "../../report-store";
import { menoraLogin, menoraHandleOtp, menoraNavigateToCommissions, menoraProduceReport, menoraDownloadZip, menoraSetReportDate } from "./menora.shared";
function s(v: any) { return String(v ?? "").trim(); }
async function getMenoraCreds(ctx: RunnerCtx) {
    const functions = (ctx as any).functions;
    const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
    const res: any = await fn({ portalId: "menora" });
    return {
        username: s(res?.data?.username),
        phoneNumber: s(res?.data?.phoneNumber),
        accountingNumber: s(res?.data?.accountingNumber),
    };
}
export async function runMenoraAll(ctx: RunnerCtx) {
    const { runId, setStatus, run, paths, storage, log } = ctx;
    const portalUrl = "https://menoranet.menora.co.il/";
    const absDir = s(paths!.downloadsDir || "./downloads");
    const agentId = s(run.agentId || ctx.agentId);
    const { username, phoneNumber, accountingNumber } = await getMenoraCreds(ctx);
    const monthLabel = run.monthLabel || "חודש נוכחי";
    await setStatus(runId, { status: "running", step: "מאתחל דפדפן מנורה...", monthLabel });
    const browser = await portalBrowser.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        log!.info(`[Menora] Navigating to: ${portalUrl}`);
        await page.goto(portalUrl, { waitUntil: "commit", timeout: 60000 });
        await page.waitForTimeout(5000);
        await menoraLogin(page, username, phoneNumber);
        await menoraHandleOtp(page, ctx);
        await setStatus(runId, { status: "running", step: "ניווט והפקת דוח...", monthLabel });
        await page.waitForTimeout(8000);
        await menoraNavigateToCommissions(page);
        await setStatus(runId, { status: "running", step: "מזין תאריך לדוח...", monthLabel });
        const now = new Date();
        let targetMonth = now.getMonth();
        let targetYear = now.getFullYear();
        if (targetMonth === 0) {
            targetMonth = 12;
            targetYear--;
        }
        const monthYearStr = `${String(targetMonth).padStart(2, '0')}.${targetYear}`;
        await menoraSetReportDate(page, monthYearStr);
        await menoraProduceReport(page, accountingNumber || undefined);
        await setStatus(runId, { status: "running", step: "ממתין להפקת ה-ZIP...", monthLabel });
        const download = await menoraDownloadZip(page);
        if (download) {
            const filename = download.suggestedFilename();
            const reportKey = path.join(absDir, `${Date.now()}_${filename}`);
            await download.saveAs(reportKey);
            const up = await uploadReport({
                storage,
                reportKey,
                agentId,
                runId,
                subdir: "menora_commissions"
            } as any);
            if (up?.storagePath) {
                const downloads = [
                    {
                        templateId: "menura_new_nifraim",
                        filename: up.filename || filename,
                        storagePath: up.storagePath
                    },
                    {
                        templateId: "menura_new_zvira",
                        filename: up.filename || filename,
                        storagePath: up.storagePath
                    }
                ];
                await setStatus(runId, {
                    downloads,
                    status: "done"
                });
            }
            else {
                await setStatus(runId, { status: "error", step: "menora_upload_failed", error: { message: "Upload failed - no storagePath" }, monthLabel });
                throw new Error("Upload failed - no storagePath");
            }
        }
        else {
            await setStatus(runId, { status: "error", step: "menora_done_no_files", error: { message: "No downloads[] / download.storagePath found" }, monthLabel });
            throw new Error("No downloads[] / download.storagePath found");
        }
    }
    catch (e: any) {
        log!.error("[Menora] Global error:", e.message);
        await setStatus(runId, { status: "error", error: { message: e.message } });
    }
    finally {
        if (browser)
            await browser.close().catch(() => { });
    }
}
