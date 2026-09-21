/* eslint-disable @typescript-eslint/no-explicit-any */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { adminDb, ensureAdminApp, nowTs } from "./shared/admin";
import { FUNCTIONS_REGION } from "./shared/region";
import { PORTAL_ENC_KEY_B64 } from "./shared/secrets";
import { buildImportInsightsForPortalRun } from "./shared/buildImportInsights";
import { buildImportInsightsEmailHtml } from "./shared/buildImportInsightsEmailHtml";
import { sendSystemEmail } from "./shared/sendgrid";
import {
  finalizePortalRunBatchFromRunChange,
} from "./shared/commissionAssistant/commissionAssistantBatchFinalizer";

import {
  handleCommissionAssistantOtpRunChange,
} from "./shared/commissionAssistant/commissionAssistantOtp";

import {
  handleCommissionAssistantRunFailureChange,
} from "./shared/commissionAssistant/commissionAssistantRunFeedback";

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

function s(v: any) {
  return String(v ?? "").trim();
}

function shouldSend(after: any, before: any) {
  // ריצות שהן חלק מ-batch מקבלות מייל סיכום אחד מרוכז (ר' commissionAssistantBatchFinalizer),
  // לא מייל בודד לכל חברה.
  if (s(after?.batchId)) return false;

  const afterStatus = s(after?.status);
  const afterStep = s(after?.step);

  const beforeStatus = s(before?.status);
  const beforeStep = s(before?.step);

  const becameDone =
    afterStatus === "success" &&
    afterStep === "import_done" &&
    !(beforeStatus === "success" && beforeStep === "import_done");

  return becameDone;
}

export const sendImportInsightsEmailOnPortalRun = onDocumentWritten(
  {
    region: FUNCTIONS_REGION,
    document: "portalImportRuns/{runId}",
    secrets: [
      SENDGRID_API_KEY,
      PORTAL_ENC_KEY_B64,
    ],
  },
  async (event) => {
    ensureAdminApp();

    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after) return;

    const runId = s(event.params.runId);
    if (!runId) return;

    const db = adminDb();

    /*
     * OTP ל-Commission Assistant:
     * כאשר Run שנוצר מ-WhatsApp נכנס ל-otp_required,
     * שולחים לסוכן בקשת קוד ב-WhatsApp.
     *
     * כשל בשליחת הודעת OTP לא חוסם את ה-Runner ולא את המיילים.
     */
    try {
      await handleCommissionAssistantOtpRunChange({
        db,
        runId,
        before: before as Record<string, any> | null,
        after: after as Record<string, any>,
        eventId: s(event.id),
      });
    } catch (otpError: any) {
      console.error(
        "[sendImportInsightsEmailOnPortalRun] OTP WhatsApp notification failed",
        {
          runId,
          error: otpError?.message || String(otpError),
        }
      );
    }

    /*
     * Provider feedback:
     * לא מזהים כאן HTML של פורטלים.
     * ה-Provider/Runner כבר זיהה את התקלה וכתב status/error/step.
     * כאן רק מתרגמים את התוצאה הקיימת לחיווי WhatsApp לסוכן.
     */
    try {
      await handleCommissionAssistantRunFailureChange({
        db,
        runId,
        before: before as Record<string, any> | null,
        after: after as Record<string, any>,
        eventId: s(event.id),
      });
    } catch (feedbackError: any) {
      console.error(
        "[sendImportInsightsEmailOnPortalRun] Provider feedback notification failed",
        {
          runId,
          error: feedbackError?.message || String(feedbackError),
        }
      );
    }

    /*
     * חדש: סגירת Batch + חיווי WhatsApp.
     * רץ על כל שינוי ב-portalImportRun, גם אם מסך ה-UI אינו פתוח.
     * כשל כאן לא חוסם את מנגנון המייל הקיים.
     */
    try {
      await finalizePortalRunBatchFromRunChange({
        db,
        runId,
        runData: after,
        sendgridApiKey: SENDGRID_API_KEY.value(),
      });
    } catch (finalizeError: any) {
      console.error(
        "[sendImportInsightsEmailOnPortalRun] Batch finalizer failed",
        {
          runId,
          error: finalizeError?.message || String(finalizeError),
        }
      );
    }

    /* מכאן ומטה נשמרת לוגיקת המייל הקיימת שלך. */
    if (!shouldSend(after, before)) return;

    const runRef = db.collection("portalImportRuns").doc(runId);

    await db
      .runTransaction(async (tx) => {
        const snap = await tx.get(runRef);
        const data = snap.data() || {};
        if (data?.emailInsightsSentAt) {
          throw new Error("already_sent");
        }
        tx.set(
          runRef,
          {
            emailInsightsSendingAt: nowTs(),
            updatedAt: nowTs(),
          },
          { merge: true }
        );
      })
      .catch((err) => {
        if (String(err?.message || "").includes("already_sent")) return;
        throw err;
      });

    const freshRunSnap = await runRef.get();
    const freshRun = freshRunSnap.data() || {};
    if (freshRun?.emailInsightsSentAt) return;

    try {
      const agentId = s(after.agentId);
      if (!agentId) throw new Error(`portalImportRun ${runId} missing agentId`);

      const userSnap = await db.collection("users").doc(agentId).get();
      const user = userSnap.data() || {};
      const to = s(user.email);

      if (!to) {
        await runRef.set(
          {
            emailInsightsError: { message: "missing user email" },
            emailInsightsSendingAt: null,
            updatedAt: nowTs(),
          },
          { merge: true }
        );
        return;
      }

      const mergedInsights = await buildImportInsightsForPortalRun(runId);
      mergedInsights.agentName = s(
        user.name || user.fullName || user.displayName || ""
      );

      const lockMonth = s(after?.resolvedWindow?.ym);

      const html = buildImportInsightsEmailHtml({
        insights: mergedInsights,
        appUrl: "https://www.magicsale.co.il/importCommissionHub/commissionSummaryTabs",
      });

      const subject =
        `📊 סיכום טעינת עמלות – ${mergedInsights.company} | ${lockMonth}`;

      await sendSystemEmail({
        apiKey: SENDGRID_API_KEY.value(),
        to,
        subject,
        html,
        text:
          `טעינת העמלות הסתיימה בהצלחה עבור ${mergedInsights.company}. ` +
          `פוליסות: ${mergedInsights.totalPolicies}, ` +
          `סה"כ עמלות: ${mergedInsights.totalCommissionAmount}`,
        category: "import_insights",
        meta: {
          portalRunId: runId,
          agentId,
          companyId: mergedInsights.companyId,
          reportMonths: mergedInsights.reportMonths,
          lockMonth,
        },
      });

      await runRef.set(
        {
          emailInsightsSentAt: nowTs(),
          emailInsightsSendingAt: null,
          updatedAt: nowTs(),
        },
        { merge: true }
      );
    } catch (error: any) {
      await runRef.set(
        {
          emailInsightsSendingAt: null,
          emailInsightsError: {
            message: s(error?.message || error),
          },
          updatedAt: nowTs(),
        },
        { merge: true }
      );
      throw error;
    }
  }
);