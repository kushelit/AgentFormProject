/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {adminDb, adminBucket, nowTs} from "../shared/admin";
import {FUNCTIONS_REGION} from "../shared/region";

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function normalizeBucketName(b: string) {
  const s = String(b || "").trim().replace(/^gs:\/\//, "");
  if (!s) return "";
  if (s.endsWith(".firebasestorage.app")) return s.replace(".firebasestorage.app", ".appspot.com");
  return s;
}

export const enqueueCommissionImportFromPortalRun = onDocumentWritten(
  {
    document: "portalImportRuns/{runId}",
    region: FUNCTIONS_REGION,
  },
  async (event) => {
    const db = adminDb();

    const runId = event.params.runId as string;
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;

    const after = afterSnap.data() as any;
    const storagePath = safeStr(after?.download?.storagePath);
    if (!storagePath) return;

    const agentId = safeStr(after?.agentId);
    const companyId = safeStr(after?.companyId);
    const templateId = safeStr(after?.templateId);

    // ✅ מחשבים מחוץ ל-transaction
    const rawBucket = safeStr(after?.download?.bucket) || adminBucket().name;
    const bucket = normalizeBucketName(rawBucket);

    const runRef = db.collection("portalImportRuns").doc(runId);
    const queueRef = db.collection("commissionImportQueue").doc(runId);

    await db.runTransaction(async (tx) => {
      const runSnap = await tx.get(runRef);
      if (runSnap.data()?.queue?.enqueuedAt) return;

      if (!agentId || !companyId || !templateId) {
        tx.set(
          runRef,
          {
            status: "error",
            error: {step: "enqueue", message: "Missing agentId/companyId/templateId"},
            updatedAt: nowTs(),
          },
          {merge: true}
        );
        return;
      }

      tx.set(
        queueRef,
        {
          jobId: runId,
          portalRunId: runId,
          source: "portalRunner",
          agentId,
          companyId,
          templateId,
          automationClass: safeStr(after?.automationClass),
          monthLabel: safeStr(after?.monthLabel),
          file: {
            bucket,
            storagePath,
            filename: safeStr(after?.download?.filename) || undefined,
          },
          status: "queued",
          createdAt: nowTs(),
          updatedAt: nowTs(),
        },
        {merge: true}
      );

      tx.set(
        runRef,
        {
          queue: {jobId: runId, enqueuedAt: nowTs(), state: "enqueued"},
          updatedAt: nowTs(),
        },
        {merge: true}
      );
    });
  }
);
