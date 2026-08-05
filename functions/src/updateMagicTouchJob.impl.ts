/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
} from "./shared/admin";

import {
  assertMagicTouchJobsAdmin,
} from "./shared/magicTouchJobs/jobPermissions";

import {
  calculateNextRunAt,
  normalizeJobSchedule,
} from "./shared/magicTouchJobs/jobSchedule";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function updateMagicTouchJobImpl(
  input: {
    uid: string | null;
    jobId: unknown;
    enabled: unknown;
    schedule: unknown;
  }
): Promise<Record<string, unknown>> {
  await assertMagicTouchJobsAdmin(
    input.uid
  );

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

  const enabled =
    input.enabled ===
    true;

  const schedule =
    normalizeJobSchedule(
      input.schedule
    );

  const nextRunAt =
    enabled
      ? calculateNextRunAt(
        schedule
      )
      : null;

  const db =
    adminDb();

  const ref =
    db.doc(
      `magic_touch_jobs/${jobId}`
    );

  const snap =
    await ref.get();

  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      "MagicTouch job was not found"
    );
  }

  await ref.update({
    enabled,
    schedule,
    nextRunAt,
    updatedAt:
      FieldValue.serverTimestamp(),
    updatedBy:
      input.uid,
  });

  return {
    ok:
      true,

    jobId,

    enabled,

    schedule,

    nextRunAt:
      nextRunAt
        ?.toDate()
        .toISOString() ||
      null,
  };
}
