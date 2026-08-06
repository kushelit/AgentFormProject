/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {getPublicMagicTouchDocumentRequest} from "./shared/magicTouchDocumentRequestService";

export async function getMagicTouchDocumentRequestPublicImpl(req: any): Promise<object> {
  return getPublicMagicTouchDocumentRequest({
    agentId: req.data?.agentId,
    requestId: req.data?.requestId,
    token: req.data?.token,
  });
}
