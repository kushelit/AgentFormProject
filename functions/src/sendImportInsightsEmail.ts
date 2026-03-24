/* eslint-disable @typescript-eslint/no-explicit-any */
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { adminDb, ensureAdminApp, nowTs } from "./shared/admin";
import { FUNCTIONS_REGION } from "./shared/region";
import { buildImportInsights } from "./shared/buildImportInsights";
import { buildImportInsightsEmailHtml } from "./shared/buildImportInsightsEmailHtml";
import { sendSystemEmail } from "./shared/sendgrid";

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

function s(v: any) {
  return String(v ?? "").trim();
}

function shouldSend(after: any, before: any) {
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

export const sendImportInsightsEmailOnPortalRun  = onDocumentWritten(
  {
    region: FUNCTIONS_REGION,
    document: "portalImportRuns/{runId}",
    secrets: [SENDGRID_API_KEY],
  },
  async (event) => {
    ensureAdminApp();

    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after) return;

    if (!shouldSend(after, before)) return;

    const runId = s(event.params.runId);
    if (!runId) return;

    const db = adminDb();
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

      const queueJobIds: string[] = Array.isArray(after?.queue?.jobIds) ? after.queue.jobIds : [];

      if (!queueJobIds.length) {
        throw new Error(`portalImportRun ${runId} has no queue.jobIds`);
      }

      const insightsList = [];
      for (const jobId of queueJobIds) {
        try {
          const insights = await buildImportInsights(jobId);
          insightsList.push(insights);
        } catch (_e) {
          // ממשיכים גם אם job אחד לא הצליח להחזיר insights
        }
      }

      if (!insightsList.length) {
        throw new Error(`no insights found for portal run ${runId}`);
      }

      const first = insightsList[0];
      const totalPolicies = insightsList.reduce((sum, x) => sum + (x.totalPolicies || 0), 0);
      const totalCustomers = insightsList.reduce((sum, x) => sum + (x.totalCustomers || 0), 0);
      const totalCommissionAmount = insightsList.reduce((sum, x) => sum + (x.totalCommissionAmount || 0), 0);
      const totalPremiumAmount = insightsList.reduce((sum, x) => sum + (x.totalPremiumAmount || 0), 0);
      const zeroCommissionPoliciesCount = insightsList.reduce(
        (sum, x) => sum + (x.zeroCommissionPoliciesCount || 0),
        0
      );

      const reportMonths = Array.from(
        new Set(insightsList.flatMap((x) => x.reportMonths || []))
      ).sort();

      const mergedInsights = {
        ...first,
        runId,
        reportMonths,
        minReportMonth: reportMonths[0] || "",
        maxReportMonth: reportMonths.length ? reportMonths[reportMonths.length - 1] : "",
        totalPolicies,
        totalCustomers,
        totalCommissionAmount,
        totalPremiumAmount,
        zeroCommissionPoliciesCount,
        zeroCommissionPoliciesTop: insightsList
          .flatMap((x) => x.zeroCommissionPoliciesTop || [])
          .slice(0, 10),
      };

      const html = buildImportInsightsEmailHtml({
        insights: mergedInsights,
        appUrl: "https://www.magicsale.co.il/importCommissionHub/commissionSummaryTabs",
      });

      const subject = `📊 סיכום טעינת עמלות – ${mergedInsights.company} | ${
        mergedInsights.maxReportMonth || mergedInsights.minReportMonth
      }`;

      await sendSystemEmail({
        apiKey: SENDGRID_API_KEY.value(),
        to,
        subject,
        html,
        text: `טעינת העמלות הסתיימה בהצלחה עבור ${mergedInsights.company}. פוליסות: ${mergedInsights.totalPolicies}, סה"כ עמלות: ${mergedInsights.totalCommissionAmount}`,
        category: "import_insights",
        meta: {
          portalRunId: runId,
          agentId,
          companyId: mergedInsights.companyId,
          templateIds: insightsList.map((x) => x.templateId),
          reportMonths,
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