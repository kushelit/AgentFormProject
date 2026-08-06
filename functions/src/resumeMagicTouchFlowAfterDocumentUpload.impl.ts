/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  adminDb,
  nowTs,
} from "./shared/admin";

function s(value: any): string {
  return String(value ?? "").trim();
}

export async function resumeMagicTouchFlowAfterDocumentUploadImpl(
  event: any
): Promise<object> {
  const before =
    event.data?.before?.data?.() || {};

  const after =
    event.data?.after?.data?.() || {};

  if (
    s(after.status) !== "completed" ||
    s(before.status) === "completed"
  ) {
    return {
      ok: true,
      skipped: true,
      reason: "not_a_new_completion",
    };
  }

  const agentId =
    s(event.params?.agentId);

  const requestId =
    s(event.params?.requestId);

  if (!agentId || !requestId) {
    return {
      ok: false,
      skipped: true,
      reason: "missing_params",
    };
  }

  const db =
    adminDb();

  const requestRef =
    (db as any).doc(
      `agents/${agentId}/magic_touch_document_requests/${requestId}`
    );

  const claim =
    await (db as any).runTransaction(
      async (transaction: any) => {
        const snap =
          await transaction.get(
            requestRef
          );

        if (!snap.exists) {
          return {
            claimed: false,
            reason: "request_not_found",
          };
        }

        const data =
          snap.data() || {};

        const resumeStatus =
          s(data.resumeStatus);

        if (
          resumeStatus === "processing" ||
          resumeStatus === "completed"
        ) {
          return {
            claimed: false,
            reason: `already_${resumeStatus}`,
          };
        }

        transaction.set(
          requestRef,
          {
            resumeStatus:
              "processing",

            resumeStartedAt:
              nowTs(),

            updatedAt:
              nowTs(),
          },
          {
            merge: true,
          }
        );

        return {
          claimed: true,
          flowRunId: s(data.flowRunId),
          nextStepId: s(data.resumeNextStepId),
        };
      }
    );

  if (!claim.claimed) {
    return {
      ok: true,
      skipped: true,
      reason: claim.reason || "not_claimed",
    };
  }

  const runId =
    s(claim.flowRunId);

  const nextStepId =
    s(claim.nextStepId);

  if (!runId) {
    await requestRef.set(
      {
        resumeStatus:
          "skipped",

        resumeError:
          "Document request has no flowRunId",

        updatedAt:
          nowTs(),
      },
      {
        merge: true,
      }
    );

    return {
      ok: true,
      skipped: true,
      reason: "missing_flow_run_id",
    };
  }

  const runRef =
    (db as any).doc(
      `agents/${agentId}/magic_touch_flow_runs/${runId}`
    );

  try {
    if (nextStepId) {
      await runRef.set(
        {
          status:
            "queued",

          currentStepId:
            nextStepId,

          waitingUntil:
            null,

          error:
            null,

          failedAt:
            null,

          updatedAt:
            nowTs(),
        },
        {
          merge: true,
        }
      );

      const mod =
        await import(
          "./dispatchMagicTouchFlowRun.impl"
        );

      await mod
        .dispatchMagicTouchFlowRunImpl({
          agentId,
          runId,
        });
    } else {
      await runRef.set(
        {
          status:
            "completed",

          currentStepId:
            null,

          waitingUntil:
            null,

          completedAt:
            nowTs(),

          updatedAt:
            nowTs(),
        },
        {
          merge: true,
        }
      );
    }

    await requestRef.set(
      {
        resumeStatus:
          "completed",

        resumedAt:
          nowTs(),

        resumeError:
          null,

        updatedAt:
          nowTs(),
      },
      {
        merge: true,
      }
    );

    return {
      ok: true,
      agentId,
      requestId,
      runId,
      nextStepId: nextStepId || null,
    };
  } catch (error: any) {
    const message =
      error?.message ||
      String(error);

    await requestRef.set(
      {
        resumeStatus:
          "failed",

        resumeFailedAt:
          nowTs(),

        resumeError:
          message,

        updatedAt:
          nowTs(),
      },
      {
        merge: true,
      }
    );

    console.error(
      "[resumeMagicTouchFlowAfterDocumentUpload] Flow resume failed",
      {
        agentId,
        requestId,
        runId,
        nextStepId,
        error: message,
      }
    );

    // לא זורקים שגיאה כדי למנוע Retry כפול של ה-Trigger.
    // ה-Run עצמו כבר שומר את הכשל ב-Dispatcher/Monitor.
    return {
      ok: false,
      agentId,
      requestId,
      runId,
      nextStepId: nextStepId || null,
      error: message,
    };
  }
}
