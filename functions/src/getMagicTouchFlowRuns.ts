/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  logger,
} from "firebase-functions";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

function toSafeHttpsError(
  error: any,
  fallbackMessage: string
): HttpsError {
  if (error instanceof HttpsError) {
    return error;
  }

  const message =
    error?.message ||
    fallbackMessage;

  return new HttpsError(
    "internal",
    message,
    {
      originalCode:
        error?.code ||
        null,

      originalDetails:
        error?.details ||
        null,
    }
  );
}

export const getMagicTouchFlowRuns =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        120,

      memory:
        "512MiB",
    },

    async (
      request
    ) => {
      if (
        !request.auth
      ) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

      try {
        const mod =
          await import(
            "./getMagicTouchFlowRuns.impl"
          );

        return await mod
          .getMagicTouchFlowRunsImpl(
            request.data
          );
      } catch (
        error:
          any
      ) {
        logger.error(
          "[getMagicTouchFlowRuns] failed",
          {
            message:
              error?.message ||
              String(
                error
              ),

            code:
              error?.code ||
              null,

            details:
              error?.details ||
              null,

            stack:
              error?.stack ||
              null,

            requestData:
              request.data ||
              null,

            authUid:
              request.auth
                ?.uid ||
              null,
          }
        );

        throw toSafeHttpsError(
          error,
          "Failed to load MagicTouch flow runs"
        );
      }
    }
  );

export const getMagicTouchFlowRunDetails =
  onCall(
    {
      region:
        FUNCTIONS_REGION,

      timeoutSeconds:
        120,

      memory:
        "512MiB",
    },

    async (
      request
    ) => {
      if (
        !request.auth
      ) {
        throw new HttpsError(
          "unauthenticated",
          "Login required"
        );
      }

      try {
        const mod =
          await import(
            "./getMagicTouchFlowRuns.impl"
          );

        return await mod
          .getMagicTouchFlowRunDetailsImpl(
            request.data
          );
      } catch (
        error:
          any
      ) {
        logger.error(
          "[getMagicTouchFlowRunDetails] failed",
          {
            message:
              error?.message ||
              String(
                error
              ),

            code:
              error?.code ||
              null,

            details:
              error?.details ||
              null,

            stack:
              error?.stack ||
              null,

            requestData:
              request.data ||
              null,

            authUid:
              request.auth
                ?.uid ||
              null,
          }
        );

        throw toSafeHttpsError(
          error,
          "Failed to load MagicTouch flow run details"
        );
      }
    }
  );
