/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  resolveMagicTouchFlowAccess,
} from "./shared/magicTouchFlowAccess";

function timestampToMillis(
  value: any
): number {
  if (
    value &&
    typeof value.toMillis ===
      "function"
  ) {
    return value.toMillis();
  }

  if (
    value &&
    typeof value.seconds ===
      "number"
  ) {
    return (
      value.seconds *
      1000
    );
  }

  return 0;
}

export async function listMagicTouchFlowsImpl(
  req: any
): Promise<object> {
  const {
    db,
    agentId,
  } =
    await resolveMagicTouchFlowAccess(
      req
    );

  const snap =
    await (db as any)
      .collection(
        `agents/${agentId}/magic_touch_flows`
      )
      .get();

  const flows =
    snap.docs
      .map(
        (
          doc: any
        ) => ({
          flowId:
            doc.id,

          ...doc.data(),
        })
      )
      .sort(
        (
          first: any,
          second: any
        ) => {
          const firstDate =
            timestampToMillis(
              first.updatedAt ||
              first.createdAt
            );

          const secondDate =
            timestampToMillis(
              second.updatedAt ||
              second.createdAt
            );

          return (
            secondDate -
            firstDate
          );
        }
      );

  return {
    ok:
      true,

    agentId,

    flows,
  };
}