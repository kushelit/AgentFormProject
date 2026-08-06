/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {createHash, randomBytes, randomUUID} from "node:crypto";
import {getStorage} from "firebase-admin/storage";
import {HttpsError} from "firebase-functions/v2/https";

import {adminDb, nowTs} from "./admin";
import {PROJECT_ID} from "./region";
import {addMagicTouchTimelineEvent} from "./magicTouchTimelineService";
import {sendWhatsAppConversationText} from "./sendWhatsAppConversationText";

export type MagicTouchDocumentType =
  | "identity_card_front"
  | "identity_card_back";

const DOCUMENT_LABELS: Record<MagicTouchDocumentType, string> = {
  identity_card_front: "תעודת זהות - צד קדמי",
  identity_card_back: "תעודת זהות - צד אחורי",
};

const REQUIRED_DOCUMENTS: MagicTouchDocumentType[] = [
  "identity_card_front",
  "identity_card_back",
];

function s(value: any): string {
  return String(value ?? "").trim();
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function publicBaseUrl(): string {
  return PROJECT_ID === "agentsale-693e8" ?
    "https://magicsale.co.il" :
    "https://test.magicsale.co.il";
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function normalizeDocumentType(value: any): MagicTouchDocumentType {
  const normalized = s(value);
  if (normalized === "identity_card_front" || normalized === "identity_card_back") {
    return normalized;
  }
  throw new HttpsError("invalid-argument", "Unsupported document type");
}

export async function createMagicTouchDocumentRequest(params: {
  agentId: string;
  contactId: string;
  conversationId: string;
  flowId: string;
  flowRunId: string;
  flowStepId: string;
  resumeNextStepId?: string | null;
  message?: string;
}): Promise<{
  requestId: string;
  uploadUrl: string;
}> {
  const agentId = s(params.agentId);
  const contactId = s(params.contactId);
  const conversationId = s(params.conversationId);

  if (!agentId || !contactId || !conversationId) {
    throw new HttpsError(
      "failed-precondition",
      "Document request requires agentId, contactId and conversationId"
    );
  }

  const db = adminDb();
  const contactRef = (db as any).doc(
    `agents/${agentId}/magic_touch_contacts/${contactId}`
  );
  const contactSnap = await contactRef.get();
  if (!contactSnap.exists) {
    throw new HttpsError("not-found", "MagicTouch contact not found");
  }

  const requestId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const uploadUrl = `${publicBaseUrl()}/MagicTouchUpload/${encodeURIComponent(agentId)}/${encodeURIComponent(requestId)}?token=${encodeURIComponent(token)}`;
  const requestRef = (db as any).doc(
    `agents/${agentId}/magic_touch_document_requests/${requestId}`
  );

  await requestRef.set({
    requestId,
    agentId,
    contactId,
    documentSet: "identity_card_both_sides",
    requiredDocuments: REQUIRED_DOCUMENTS,
    uploadedDocuments: {},
    status: "requested",
    tokenHash: tokenHash(token),
    createdAt: nowTs(),
    updatedAt: nowTs(),
    completedAt: null,
    cancelledAt: null,
    flowId: s(params.flowId) || null,
    flowRunId: s(params.flowRunId) || null,
    flowStepId: s(params.flowStepId) || null,
    resumeNextStepId: s(params.resumeNextStepId) || null,
  });

  await contactRef.set({
    documents: {
      latestRequestId: requestId,
      latestRequestStatus: "requested",
      latestRequestAt: nowTs(),
    },
    updatedAt: nowTs(),
  }, {merge: true});

  const defaultMessage = [
    "לצורך הכנת התהליך, יש להעלות צילום ברור של שני צדי תעודת הזהות בקישור המאובטח:",
    uploadUrl,
  ].join("\n\n");

  const message = s(params.message) || defaultMessage;
  const resolvedMessage = message.includes("{{uploadUrl}}") ?
    message.replaceAll("{{uploadUrl}}", uploadUrl) :
    `${message}\n\n${uploadUrl}`;

  await sendWhatsAppConversationText({
    agentId,
    conversationId,
    text: resolvedMessage,
    sentBy: "magic_touch_automation",
    sentByName: "MagicTouch",
    source: "magic_touch_document_request",
    flowRunId: s(params.flowRunId),
    flowId: s(params.flowId),
    eventId: null,
  });

  await addMagicTouchTimelineEvent({
    agentId,
    contactId,
    type: "document_request_sent",
    channel: "automation",
    title: "נשלחה בקשה להעלאת תעודת זהות",
    description: "נשלח ללקוח קישור מאובטח להעלאת שני צדי תעודת הזהות.",
    direction: "outbound",
    status: "pending",
    createdBy: "magic_touch_automation",
    sourceSystem: "magic_touch",
    sourceRecordId: requestId,
    metadata: {
      requestId,
      documentSet: "identity_card_both_sides",
      flowRunId: s(params.flowRunId) || null,
      flowId: s(params.flowId) || null,
      flowStepId: s(params.flowStepId) || null,
      },
  });

  return {requestId, uploadUrl};
}

export async function getPublicMagicTouchDocumentRequest(params: {
  agentId: string;
  requestId: string;
  token: string;
}): Promise<Record<string, any>> {
  const agentId = s(params.agentId);
  const requestId = s(params.requestId);
  const token = s(params.token);

  if (!agentId || !requestId || !token) {
    throw new HttpsError("invalid-argument", "Missing request details");
  }

  const db = adminDb();
  const requestRef = (db as any).doc(
    `agents/${agentId}/magic_touch_document_requests/${requestId}`
  );
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) {
    throw new HttpsError("not-found", "Document request not found");
  }

  const request = requestSnap.data() as any;
  if (s(request.tokenHash) !== tokenHash(token)) {
    throw new HttpsError("permission-denied", "Invalid upload link");
  }

  const contactSnap = await (db as any).doc(
    `agents/${agentId}/magic_touch_contacts/${s(request.contactId)}`
  ).get();
  const contact = contactSnap.exists ? contactSnap.data() : {};

  return {
    ok: true,
    requestId,
    agentId,
    contactName: s(contact?.fullName) || s(contact?.firstName) || "לקוח",
    status: s(request.status),
    documentSet: s(request.documentSet),
    requiredDocuments: Array.isArray(request.requiredDocuments) ? request.requiredDocuments : REQUIRED_DOCUMENTS,
    uploadedDocuments: request.uploadedDocuments || {},
  };
}

export async function uploadPublicMagicTouchDocument(params: {
  agentId: string;
  requestId: string;
  token: string;
  documentType: string;
  mimeType: string;
  base64Data: string;
}): Promise<Record<string, any>> {
  const agentId = s(params.agentId);
  const requestId = s(params.requestId);
  const token = s(params.token);
  const documentType = normalizeDocumentType(params.documentType);
  const mimeType = s(params.mimeType).toLowerCase();

  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new HttpsError("invalid-argument", "Only JPG, PNG and WEBP images are supported");
  }

  const base64Data = s(params.base64Data).replace(/^data:[^;]+;base64,/, "");
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch {
    throw new HttpsError("invalid-argument", "Invalid image data");
  }

  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    throw new HttpsError("invalid-argument", "Image must be smaller than 5MB");
  }

  const db = adminDb();
  const requestRef = (db as any).doc(
    `agents/${agentId}/magic_touch_document_requests/${requestId}`
  );
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) {
    throw new HttpsError("not-found", "Document request not found");
  }

  const request = requestSnap.data() as any;
  if (s(request.tokenHash) !== tokenHash(token)) {
    throw new HttpsError("permission-denied", "Invalid upload link");
  }
  if (["cancelled", "completed"].includes(s(request.status))) {
    throw new HttpsError("failed-precondition", "Document request is no longer active");
  }
  const contactId = s(request.contactId);
  const extension = extensionForMimeType(mimeType);
  const documentId = `${requestId}_${documentType}`;
  const storagePath = `agents/${agentId}/magicTouchDocuments/${contactId}/${requestId}/${documentType}.${extension}`;
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    resumable: false,
    contentType: mimeType,
    metadata: {
      cacheControl: "private, max-age=0, no-store",
      metadata: {
        agentId,
        contactId,
        requestId,
        documentType,
      },
    },
  });

  const documentRef = (db as any).doc(
    `agents/${agentId}/magic_touch_documents/${documentId}`
  );
  await documentRef.set({
    documentId,
    requestId,
    agentId,
    contactId,
    documentType,
    documentLabel: DOCUMENT_LABELS[documentType],
    fileName: `${DOCUMENT_LABELS[documentType]}.${extension}`,
    mimeType,
    size: buffer.length,
    bucket: bucket.name,
    storagePath,
    source: "magic_touch_customer_upload",
    uploadedBy: "customer",
    createdAt: nowTs(),
    updatedAt: nowTs(),
  }, {merge: true});

  const transactionResult = await (db as any).runTransaction(async (transaction: any) => {
    const freshSnap = await transaction.get(requestRef);
    if (!freshSnap.exists) {
      throw new HttpsError("not-found", "Document request not found");
    }
    const fresh = freshSnap.data() as any;
    const uploadedDocuments = {
      ...(fresh.uploadedDocuments || {}),
      [documentType]: {
        documentId,
        uploadedAt: nowTs(),
      },
    };
    const complete = REQUIRED_DOCUMENTS.every((type) => Boolean(uploadedDocuments[type]?.documentId));
    transaction.set(requestRef, {
      uploadedDocuments,
      status: complete ? "completed" : "partially_uploaded",
      completedAt: complete ? nowTs() : null,
      resumeStatus: complete ? "pending" : null,
      resumeRequestedAt: complete ? nowTs() : null,
      updatedAt: nowTs(),
    }, {merge: true});
    return {complete, request: fresh, uploadedDocuments};
  });

  if (transactionResult.complete) {
    const contactRef = (db as any).doc(
      `agents/${agentId}/magic_touch_contacts/${contactId}`
    );
    await contactRef.set({
      documents: {
        latestRequestId: requestId,
        latestRequestStatus: "completed",
        identityCardStatus: "uploaded",
        identityCardUploadedAt: nowTs(),
      },
      updatedAt: nowTs(),
    }, {merge: true});

    await addMagicTouchTimelineEvent({
      agentId,
      contactId,
      type: "document_upload_completed",
      channel: "customer_portal",
      title: "הועלו שני צדי תעודת הזהות",
      description: "הלקוח השלים העלאה מאובטחת של צד קדמי וצד אחורי.",
      direction: "inbound",
      status: "completed",
      createdBy: "customer",
      sourceSystem: "magic_touch",
      sourceRecordId: requestId,
      metadata: {
        requestId,
        documentSet: "identity_card_both_sides",
        documentIds: REQUIRED_DOCUMENTS.map((type) => transactionResult.uploadedDocuments[type]?.documentId),
      },
    });

    // המשך ה-Flow מתבצע ב-Trigger נפרד.
    // פונקציית ההעלאה מחזירה הצלחה ללקוח מיד לאחר שמירת שני המסמכים.
  }

  return {
    ok: true,
    requestId,
    documentId,
    documentType,
    status: transactionResult.complete ? "completed" : "partially_uploaded",
    completed: transactionResult.complete,
  };
}
