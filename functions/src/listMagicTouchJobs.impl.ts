/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  adminDb,
} from "./shared/admin";

import {
  assertMagicTouchJobsAdmin,
} from "./shared/magicTouchJobs/jobPermissions";

import {
  ensureDefaultMagicTouchJobs,
} from "./shared/magicTouchJobs/jobStore";

function serialize(
  value: any
): any {
  if (
    value &&
    typeof value.toDate ===
      "function"
  ) {
    return value
      .toDate()
      .toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(
      serialize
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    const result:
      Record<string, any> = {};

    for (
      const [
        key,
        nested,
      ] of
      Object.entries(value)
    ) {
      result[key] =
        serialize(nested);
    }

    return result;
  }

  return value;
}

export async function listMagicTouchJobsImpl(
  input: {
    uid: string | null;
  }
): Promise<Record<string, unknown>> {
  await assertMagicTouchJobsAdmin(
    input.uid
  );

  await ensureDefaultMagicTouchJobs();

  const db =
    adminDb();

  const [
    jobsSnap,
    runsSnap,
  ] =
    await Promise.all([
      db
        .collection(
          "magic_touch_jobs"
        )
        .orderBy(
          "name",
          "asc"
        )
        .get(),

      db
        .collection(
          "magic_touch_job_runs"
        )
        .orderBy(
          "startedAt",
          "desc"
        )
        .limit(25)
        .get(),
    ]);

  return {
    ok:
      true,

    jobs:
      jobsSnap.docs.map(
        (
          doc
        ) => ({
          id:
            doc.id,

          ...serialize(
            doc.data()
          ),
        })
      ),

    recentRuns:
      runsSnap.docs.map(
        (
          doc
        ) => ({
          id:
            doc.id,

          ...serialize(
            doc.data()
          ),
        })
      ),
  };
}
