// Ported from the native provider; browser report keys replace local files.
import { reportPath as path } from "../../report-store";
import { portalBrowser, Page, BrowserContext } from "../../browser";
import type { RunnerCtx } from "../../types";
import { httpsCallable } from "firebase/functions";
import { uploadReport } from "../../report-store";
import { ayalonLogin, ayalonHandleOtp, ayalonDismissPopupQuick, ayalonDumpArtifacts, ayalonNavigateToReport, ayalonOpenReportTab, ayalonFilterDate, ayalonExportExcel, } from "./ayalon.shared";
function s(v: any) {
    return String(v ?? "").trim();
}
async function getAyalonCreds(ctx: RunnerCtx) {
    const functions = (ctx as any).functions;
    if (!functions)
        throw new Error("Missing ctx.functions");
    const fn = httpsCallable(functions, "getPortalCredentialsDecrypted");
    const res: any = await fn({ portalId: "ayalon" });
    return {
        username: s(res?.data?.username),
        password: s(res?.data?.password),
    };
}
function getPrevMonthLabel(): string {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const mm = String(prev.getMonth() + 1).padStart(2, "0");
    const yyyy = prev.getFullYear();
    return `01/${mm}/${yyyy}`;
}
export async function runAyalonAll(ctx: RunnerCtx) {
    const { runId, setStatus, run, paths, storage } = ctx;
    const portalUrl = "https://portal.ayalon-ins.co.il/";
    const absDir = s(paths?.downloadsDir || "./downloads");
    const monthLabel = (run.resolvedWindow?.kind === "month"
        ? (run.resolvedWindow.label || run.monthLabel)
        : run.resolvedWindow?.label) || "חודש נוכחי";
    const agentId = s((run as any)?.agentId || ctx.agentId);
    const { username, password } = await getAyalonCreds(ctx);
    const prevMonth = getPrevMonthLabel();
    await setStatus(runId, { status: "running", step: "ayalon_open_portal", monthLabel });
    const context = await portalBrowser.launchPersistentContext("");
    let page = context.pages()[0] || await context.newPage();
    await page.bringToFront();
    try {
        await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => { });
        await page.waitForTimeout(3000);
        await setStatus(runId, { status: "running", step: "מבצע לוגין לאיילון", monthLabel });
        await ayalonLogin(page, username, password);
        await page.waitForTimeout(4000);
        await setStatus(runId, {
            status: "otp_required",
            step: "ממתין לקוד אימות (SMS) מחברת איילון",
            "otp.mode": "firestore",
            monthLabel,
        });
        await ayalonHandleOtp(page, ctx);
        await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => { });
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => { });
        await page.waitForTimeout(5000);
        const allPages = context.pages();
        if (allPages.length > 1) {
            page = allPages[allPages.length - 1];
            await page.bringToFront();
            await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => { });
            await page.waitForTimeout(3000);
        }
        await ayalonDismissPopupQuick(page);
        await page.waitForTimeout(2000);
        await setStatus(runId, { status: "running", step: "מנסה לנווט לדוחות", monthLabel });
        await ayalonNavigateToReport(page);
        await page.waitForTimeout(3000);
        await setStatus(runId, { status: "running", step: "פותח דוח נפרעים", monthLabel });
        const reportPage = await ayalonOpenReportTab(page, context);
        await page.waitForTimeout(10000);
        await setStatus(runId, { status: "running", step: `מסנן לחודש ${prevMonth}`, monthLabel });
        await ayalonFilterDate(reportPage, prevMonth);
        await setStatus(runId, { status: "running", step: "מייצא לאקסל", monthLabel });
        const download = await ayalonExportExcel(reportPage);
        if (download) {
            const filename = download.suggestedFilename();
            const reportKey = path.join(absDir, `${Date.now()}_${filename}`);
            await download.saveAs(reportKey);
            const up = await uploadReport({
                storage,
                reportKey,
                agentId,
                runId,
                subdir: "ayalon_insurance",
            } as any);
            if (up?.storagePath) {
                const downloads = [{
                        templateId: "ayalon_insurance",
                        reportKey,
                        filename: up.filename || filename,
                        storagePath: up.storagePath,
                    }];
                await setStatus(runId, { downloads, status: "done", step: "ayalon_done", monthLabel });
            }
            else {
                await setStatus(runId, { status: "error", step: "ayalon_upload_failed", error: { message: "Upload failed - no storagePath" }, monthLabel });
                throw new Error("Upload failed - no storagePath");
            }
        }
        else {
            await setStatus(runId, { status: "error", step: "ayalon_done_no_files", error: { message: "No downloads[] / download.storagePath found" }, monthLabel });
            throw new Error("No downloads[] / download.storagePath found");
        }
    }
    catch (e: any) {
        try {
            await ayalonDumpArtifacts(page, absDir, "error_state");
        }
        catch { }
        await setStatus(runId, { status: "error", error: e?.message || String(e), monthLabel });
        throw e;
    }
    finally {
        await context.close().catch(() => { });
    }
}
