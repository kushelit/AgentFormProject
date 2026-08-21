/* eslint-disable require-jsdoc */

import {
  onDocumentWritten,
} from "firebase-functions/v2/firestore";

import {
  logger,
} from "firebase-functions";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

import {
  PORTAL_ENC_KEY_B64,
  SURENSE_ACTIVITY_API_KEY,
} from "./shared/secrets";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export const dispatchMagicTouchFlowRun =
  onDocumentWritten(
    {
      region:
        FUNCTIONS_REGION,

      document:
        "agents/{agentId}/magic_touch_flow_runs/{runId}",

      secrets: [
        PORTAL_ENC_KEY_B64,
        SURENSE_ACTIVITY_API_KEY,
      ],

      timeoutSeconds:
        120,

      memory:
        "256MiB",
    },

    async (
      event
    ) => {
      const agentId =
        s(
          event.params
            .agentId
        );

      const runId =
        s(
          event.params
            .runId
        );

      if (
        !agentId ||
        !runId
      ) {
        logger.warn(
          "[dispatchMagicTouchFlowRun] Missing trigger parameters",
          {
            agentId,
            runId,
          }
        );

        return;
      }

      const beforeExists =
        event.data
          ?.before
          ?.exists ||
        false;

      const afterExists =
        event.data
          ?.after
          ?.exists ||
        false;

      /*
       * אם המסמך נמחק, אין מה להריץ.
       */
      if (
        !afterExists
      ) {
        return;
      }

      const beforeData =
        beforeExists
          ? event.data
              ?.before
              ?.data()
          : null;

      const afterData =
        event.data
          ?.after
          ?.data();

      const beforeStatus =
        s(
          beforeData
            ?.status
        );

      const afterStatus =
        s(
          afterData
            ?.status
        );

      /*
       * מריצים Dispatcher רק כאשר:
       *
       * 1. Run חדש נוצר כבר ב-queued
       * 2. Run קיים עבר מסטטוס אחר ל-queued
       *
       * לא מריצים שוב על כל updatedAt,
       * processing, waiting, completed וכו'.
       */
      const shouldDispatch =
        afterStatus ===
          "queued" &&
        (
          !beforeExists ||
          beforeStatus !==
            "queued"
        );

      if (
        !shouldDispatch
      ) {
        return;
      }

      logger.info(
        "[dispatchMagicTouchFlowRun] Queued run detected",
        {
          agentId,
          runId,
          beforeStatus:
            beforeStatus ||
            null,
          afterStatus,
          isNewRun:
            !beforeExists,
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
    }
  );