/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  assertMagicTouchJobsAdmin,
} from "./shared/magicTouchJobs/jobPermissions";

import {
  runMagicTouchJobCore,
} from "./shared/magicTouchJobs/runMagicTouchJobCore";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function runMagicTouchJobNowImpl(
  input: {
    uid: string | null;
    jobId: unknown;
  }
): Promise<Record<string, unknown>> {
  await assertMagicTouchJobsAdmin(
    input.uid
  );

  return runMagicTouchJobCore({
    jobId:
      s(
        input.jobId
      ),

    source:
      "manual",

    requestedBy:
      input.uid,
  });
}
