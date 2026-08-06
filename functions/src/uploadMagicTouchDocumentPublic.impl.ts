/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {uploadPublicMagicTouchDocument} from "./shared/magicTouchDocumentRequestService";

export async function uploadMagicTouchDocumentPublicImpl(req: any): Promise<object> {
  return uploadPublicMagicTouchDocument({
    agentId: req.data?.agentId,
    requestId: req.data?.requestId,
    token: req.data?.token,
    documentType: req.data?.documentType,
    mimeType: req.data?.mimeType,
    base64Data: req.data?.base64Data,
  });
}
