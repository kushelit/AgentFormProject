/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
} from "../admin";

import {
  executeMagicTouchJobAction,
} from "./jobRegistry";

import {
  calculateNextRunAt,
} from "./jobSchedule";

import type {
  MagicTouchJobDefinition,
  MagicTouchJobRunSource,
} from "./jobTypes";

const LOCK_MINUTES =
  30;

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function errorMessage(
  error: unknown
): string {
  if (
    error &&
    typeof error ===
      "object" &&
    "message" in error
  ) {
    return s(
      (
        error as {
          message?: unknown;
        }
      ).message
    ) ||
    "Unknown error";
  }

  return s(error) ||
    "Unknown error";
}

export async function runMagicTouchJobCore(
  input: {
    jobId: string;
    source: MagicTouchJobRunSource;
    requestedBy?: string | null;
  }
): Promise<Record<string, unknown>> {
  const jobId =
    s(
      input.jobId
    );

  if (!jobId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing jobId"
    );
  }

  const db =
    adminDb();

  const jobRef =
    db.doc(
      `magic_touch_jobs/${jobId}`
    );

  const runRef =
    db
      .collection(
        "magic_touch_job_runs"
      )
      .doc();

  const now =
    Timestamp.now();

  const lockUntil =
    Timestamp.fromMillis(
      now.toMillis() +
      LOCK_MINUTES *
      60 *
      1000
    );

  /*
   * מחזירים את הגדרת העיבוד מתוך ה-transaction.
   * כך TypeScript יודע בוודאות שהאובייקט קיים לאחר סיום העסקה,
   * ואין תלות במשתנה חיצוני שמוקצה מתוך callback.
   */
  const loadedJob =
    await db.runTransaction<
      MagicTouchJobDefinition
    >(
      async (
        transaction
      ) => {
        const snap =
          await transaction.get(
            jobRef
          );

        if (!snap.exists) {
          throw new HttpsError(
            "not-found",
            "MagicTouch job was not found"
          );
        }

        const job =
          snap.data() as
            MagicTouchJobDefinition;

        if (
          input.source ===
            "scheduler" &&
          job.enabled !==
            true
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Scheduled job is disabled"
          );
        }

        const currentLock =
          job.lockUntil as
            Timestamp |
            null |
            undefined;

        if (
          currentLock &&
          currentLock.toMillis() >
            now.toMillis()
        ) {
          throw new HttpsError(
            "already-exists",
            "MagicTouch job is already running"
          );
        }

        transaction.create(
          runRef,
          {
            runId:
              runRef.id,

            jobId,

            jobName:
              job.name ||
              jobId,

            action:
              job.action,

            source:
              input.source,

            status:
              "running",

            requestedBy:
              input.requestedBy ||
              null,

            startedAt:
              now,

            completedAt:
              null,

            summary:
              null,

            error:
              null,
          }
        );

        transaction.update(
          jobRef,
          {
            lastRunStatus:
              "running",

            runningRunId:
              runRef.id,

            lockUntil,

            updatedAt:
              now,
          }
        );

        return job;
      }
    );

  try {
    const summary =
      await executeMagicTouchJobAction(
        loadedJob.action
      );

    const completedAt =
      Timestamp.now();

    const nextRunAt =
      loadedJob.enabled
        ? calculateNextRunAt(
          loadedJob.schedule,
          completedAt.toDate()
        )
        : null;

    await db.runTransaction(
      async (
        transaction
      ) => {
        transaction.update(
          runRef,
          {
            status:
              "success",

            completedAt,

            summary,

            error:
              null,
          }
        );

        transaction.update(
          jobRef,
          {
            lastRunAt:
              completedAt,

            lastRunStatus:
              "success",

            lastRunSummary:
              summary,

            lastRunError:
              null,

            nextRunAt,

            runningRunId:
              FieldValue.delete(),

            lockUntil:
              FieldValue.delete(),

            updatedAt:
              completedAt,
          }
        );
      }
    );

    return {
      ok:
        true,

      runId:
        runRef.id,

      jobId,

      status:
        "success",

      summary,

      nextRunAt,
    };
  } catch (
    error
  ) {
    const completedAt =
      Timestamp.now();

    const message =
      errorMessage(error);

    const nextRunAt =
      loadedJob.enabled
        ? calculateNextRunAt(
          loadedJob.schedule,
          completedAt.toDate()
        )
        : null;

    await db.runTransaction(
      async (
        transaction
      ) => {
        transaction.update(
          runRef,
          {
            status:
              "failed",

            completedAt,

            summary:
              null,

            error:
              message,
          }
        );

        transaction.update(
          jobRef,
          {
            lastRunAt:
              completedAt,

            lastRunStatus:
              "failed",

            lastRunSummary:
              null,

            lastRunError:
              message,

            nextRunAt,

            runningRunId:
              FieldValue.delete(),

            lockUntil:
              FieldValue.delete(),

            updatedAt:
              completedAt,
          }
        );
      }
    );

    throw new HttpsError(
      "internal",
      message
    );
  }
}
