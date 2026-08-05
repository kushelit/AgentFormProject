/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  adminDb,
} from "../admin";

import {
  DEFAULT_MAGIC_TOUCH_JOBS,
} from "./jobRegistry";

import {
  calculateNextRunAt,
} from "./jobSchedule";

export async function ensureDefaultMagicTouchJobs():
Promise<void> {
  const db =
    adminDb();

  for (
    const definition of
    Object.values(
      DEFAULT_MAGIC_TOUCH_JOBS
    )
  ) {
    const ref =
      db.doc(
        `magic_touch_jobs/${definition.jobId}`
      );

    const snap =
      await ref.get();

    if (snap.exists) {
      continue;
    }

    await ref.create({
      ...definition,

      nextRunAt:
        definition.enabled
          ? calculateNextRunAt(
            definition.schedule
          )
          : null,

      createdAt:
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),

      updatedBy:
        null,
    });
  }
}
