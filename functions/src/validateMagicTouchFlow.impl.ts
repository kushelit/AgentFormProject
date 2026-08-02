/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  resolveMagicTouchFlowAccess,
} from "./shared/magicTouchFlowAccess";

import {
  validateMagicTouchFlow,
} from "./shared/magicTouchFlowValidation";

export async function validateMagicTouchFlowImpl(
  req: any
): Promise<object> {
  const {
    agentId,
  } =
    await resolveMagicTouchFlowAccess(
      req
    );

  const flow =
    req.data?.flow ||
    {};

  return {
    ok: true,
    agentId,
    validation:
      validateMagicTouchFlow(
        flow
      ),
  };
}
