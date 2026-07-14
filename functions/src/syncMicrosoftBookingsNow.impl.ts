/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  syncMicrosoftBookingsAgent,
} from "./shared/microsoftBookingsSync";

export async function syncMicrosoftBookingsNowImpl(
  agentId: string
): Promise<object> {
  const result =
    await syncMicrosoftBookingsAgent(agentId);

  return {
    ok: true,
    ...result,
  };
}