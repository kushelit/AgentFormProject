/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  assertMagicTouchJobsAdmin,
} from "./shared/magicTouchJobs/jobPermissions";

import {
  syncMicrosoftBookingsAgent,
} from "./shared/microsoftBookingsSync";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function syncMicrosoftBookingsNowImpl(
  input: {
    uid: string | null;
    agentId: unknown;
  }
): Promise<object> {
  await assertMagicTouchJobsAdmin(
    input.uid
  );

  const agentId =
    s(
      input.agentId
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "agentId is required"
    );
  }

  const result =
    await syncMicrosoftBookingsAgent(
      agentId
    );

  return {
    ok: true,
    agentId,
    ...result,
  };
}