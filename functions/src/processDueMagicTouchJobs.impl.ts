/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  logger,
} from "firebase-functions";

import {
  Timestamp,
} from "firebase-admin/firestore";

import {
  adminDb,
} from "./shared/admin";

import {
  ensureDefaultMagicTouchJobs,
} from "./shared/magicTouchJobs/jobStore";

import {
  runMagicTouchJobCore,
} from "./shared/magicTouchJobs/runMagicTouchJobCore";

export async function processDueMagicTouchJobsImpl():
Promise<Record<string, unknown>> {
  await ensureDefaultMagicTouchJobs();

  const db =
    adminDb();

  const now =
    Timestamp.now();

  const dueSnap =
    await db
      .collection(
        "magic_touch_jobs"
      )
      .where(
        "enabled",
        "==",
        true
      )
      .where(
        "nextRunAt",
        "<=",
        now
      )
      .limit(25)
      .get();

  let completed =
    0;

  let failed =
    0;

  const errors:
    Array<{
      jobId: string;
      error: string;
    }> = [];

  for (
    const jobDoc of
    dueSnap.docs
  ) {
    try {
      await runMagicTouchJobCore({
        jobId:
          jobDoc.id,

        source:
          "scheduler",

        requestedBy:
          null,
      });

      completed++;
    } catch (
      error: any
    ) {
      failed++;

      const message =
        error?.message ||
        String(error);

      errors.push({
        jobId:
          jobDoc.id,

        error:
          message,
      });

      logger.error(
        "[processDueMagicTouchJobs] job failed",
        {
          jobId:
            jobDoc.id,

          error:
            message,
        }
      );
    }
  }

  const result = {
    due:
      dueSnap.size,

    completed,

    failed,

    errors,
  };

  logger.info(
    "[processDueMagicTouchJobs] completed",
    result
  );

  return result;
}
