/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  safeString,
} from "./shared/magicTouchContacts";

import {
  resolveMagicTouchFlowAccess,
} from "./shared/magicTouchFlowAccess";

export async function listMagicTouchFlowRunsImpl(
  req: any
): Promise<object> {
  const {
    db,
    agentId,
  } =
    await resolveMagicTouchFlowAccess(
      req
    );

  const flowId =
    safeString(
      req.data?.flowId
    );

  const limit =
    Math.min(
      Math.max(
        Number(
          req.data?.limit ||
          50
        ),
        1
      ),
      100
    );

  let query =
    (db as any)
      .collection(
        `agents/${agentId}/magic_touch_flow_runs`
      )
      .orderBy(
        "createdAt",
        "desc"
      )
      .limit(
        limit
      );

  if (flowId) {
    query =
      (db as any)
        .collection(
          `agents/${agentId}/magic_touch_flow_runs`
        )
        .where(
          "flowId",
          "==",
          flowId
        )
        .orderBy(
          "createdAt",
          "desc"
        )
        .limit(
          limit
        );
  }

  const snap =
    await query.get();

  return {
    ok: true,
    agentId,
    runs: snap.docs.map(
      (doc: any) => ({
        runId: doc.id,
        ...doc.data(),
      })
    ),
  };
}
