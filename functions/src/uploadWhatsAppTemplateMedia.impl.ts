/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "crypto";

import { adminDb } from "./shared/admin";
import {
  PORTAL_ENC_KEY_B64,
  META_APP_ID,
} from "./shared/secrets";
import { decryptJsonAes256Gcm } from "./shared/cryptoAesGcm";

import {
  requireBackendPermission,
} from "./shared/backendPermissions";

const META_API_VERSION = "v25.0";
const META_GRAPH_URL =
  `https://graph.facebook.com/${META_API_VERSION}`;

const MAX_PDF_SIZE_BYTES =
  10 * 1024 * 1024;

const MAX_IMAGE_SIZE_BYTES =
  5 * 1024 * 1024;

function s(value: any): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizeBase64(
  value: unknown
): string {
  const raw =
    s(value);

  if (!raw) {
    return "";
  }

  const commaIndex =
    raw.indexOf(",");

  if (
    raw.startsWith("data:") &&
    commaIndex >= 0
  ) {
    return raw.slice(
      commaIndex + 1
    );
  }

  return raw;
}

function getMediaType(
  mimeType: string
): "DOCUMENT" | "IMAGE" {
  if (
    mimeType ===
    "application/pdf"
  ) {
    return "DOCUMENT";
  }

  if (
    mimeType ===
      "image/jpeg" ||
    mimeType ===
      "image/png"
  ) {
    return "IMAGE";
  }

  throw new HttpsError(
    "invalid-argument",
    "Only PDF, JPG and PNG files are supported"
  );
}

function sanitizeFileName(
  fileName: string
): string {
  const normalized =
    s(fileName)
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "_"
      )
      .replace(
        /^_+|_+$/g,
        ""
      );

  return (
    normalized ||
    "template-media"
  );
}

function validateFileSize(
  mediaType:
    "DOCUMENT" | "IMAGE",
  size: number
) {
  const maxSize =
    mediaType ===
    "DOCUMENT"
      ? MAX_PDF_SIZE_BYTES
      : MAX_IMAGE_SIZE_BYTES;

  if (
    size >
    maxSize
  ) {
    throw new HttpsError(
      "invalid-argument",
      mediaType ===
        "DOCUMENT"
        ? "PDF file is too large"
        : "Image file is too large"
    );
  }
}

export async function uploadWhatsAppTemplateMediaImpl(
  req: any
): Promise<object> {
  const authUid =
    s(
      req.auth?.uid
    );

  if (!authUid) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const db =
    adminDb();

  const userSnap =
    await (db as any)
      .collection("users")
      .doc(authUid)
      .get();

  if (
    !userSnap.exists
  ) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() as any;

  await requireBackendPermission({
    db:
      db as any,

    userId:
      authUid,

    userData,

    permission:
      "access_magic_touch",
  });

  const isAdmin =
    userData?.role ===
      "admin" ||
    userData?.isSystem ===
      true;

  const userAgentId =
    s(
      userData?.agentId
    );

  const agentId =
    s(
      req.data?.agentId
    );

  const fileName =
    s(
      req.data?.fileName
    );

  const mimeType =
    s(
      req.data?.mimeType
    ).toLowerCase();

  const base64Data =
    normalizeBase64(
      req.data?.base64Data
    );

  if (
    !agentId ||
    !fileName ||
    !mimeType ||
    !base64Data
  ) {
    throw new HttpsError(
      "invalid-argument",
      "agentId, fileName, mimeType and base64Data are required"
    );
  }

  if (
    !isAdmin &&
    (
      !userAgentId ||
      userAgentId !==
        agentId
    )
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot manage WhatsApp templates for another agent"
    );
  }

  const mediaType =
    getMediaType(
      mimeType
    );

  let fileBuffer:
    Buffer;

  try {
    fileBuffer =
      Buffer.from(
        base64Data,
        "base64"
      );
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "Invalid file data"
    );
  }

  if (
    !fileBuffer.length
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Uploaded file is empty"
    );
  }

  validateFileSize(
    mediaType,
    fileBuffer.length
  );

  /*
   * שומרים עותק קבוע ב-Firebase Storage.
   *
   * ה-Meta upload handle משמש את אישור התבנית,
   * אבל לשליחה בפועל נצטרך שוב את הקובץ עצמו.
   */
  const storagePath =
    [
      "agents",
      agentId,
      "whatsapp-template-media",
      `${randomUUID()}-${sanitizeFileName(fileName)}`,
    ].join("/");

  const storageFile =
    getStorage()
      .bucket()
      .file(
        storagePath
      );

  try {
    await storageFile.save(
      fileBuffer,
      {
        resumable:
          false,

        contentType:
          mimeType,

        metadata: {
          contentType:
            mimeType,

          metadata: {
            agentId,
            originalFileName:
              fileName,
            mediaType,
            uploadedBy:
              authUid,
          },
        },
      }
    );
  } catch (
    storageError: any
  ) {
    console.error(
      "[uploadWhatsAppTemplateMedia] Firebase Storage save failed",
      {
        agentId,
        storagePath,
        error:
          storageError?.message ||
          String(
            storageError
          ),
      }
    );

    throw new HttpsError(
      "internal",
      "Failed to save template media"
    );
  }

  const appId =
    s(
      META_APP_ID.value()
    );

  if (!appId) {
    throw new HttpsError(
      "failed-precondition",
      "Missing META_APP_ID"
    );
  }

  const waSecretSnap =
    await (db as any)
      .doc(
        `agents/${agentId}/secrets/whatsapp`
      )
      .get();

  if (
    !waSecretSnap.exists
  ) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp token not configured for agent"
    );
  }

  const keyB64 =
    PORTAL_ENC_KEY_B64.value();

  if (!keyB64) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const waSecret =
    waSecretSnap.data() as any;

  const decrypted =
    decryptJsonAes256Gcm(
      keyB64,
      waSecret.enc
    ) as any;

  const accessToken =
    s(
      decrypted?.accessToken
    );

  if (!accessToken) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid WhatsApp token for agent"
    );
  }

  /*
   * STEP 1
   * פתיחת Resumable Upload Session אצל Meta.
   */
  const createSessionUrl =
    new URL(
      `${META_GRAPH_URL}/${appId}/uploads`
    );

  createSessionUrl.searchParams.set(
    "file_name",
    fileName
  );

  createSessionUrl.searchParams.set(
    "file_length",
    String(
      fileBuffer.length
    )
  );

  createSessionUrl.searchParams.set(
    "file_type",
    mimeType
  );

  const sessionResponse =
    await fetch(
      createSessionUrl.toString(),
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      }
    );

  const sessionJson:
    any =
    await sessionResponse.json();

  if (
    !sessionResponse.ok
  ) {
    console.error(
      "[uploadWhatsAppTemplateMedia] Meta create upload session error:",
      JSON.stringify(
        sessionJson
      )
    );

    throw new HttpsError(
      "failed-precondition",
      sessionJson?.error
        ?.error_user_msg ||
        sessionJson?.error
          ?.message ||
        "Failed to create Meta upload session"
    );
  }

  const uploadSessionId =
    s(
      sessionJson?.id
    );

  if (
    !uploadSessionId
  ) {
    console.error(
      "[uploadWhatsAppTemplateMedia] Missing upload session id:",
      JSON.stringify(
        sessionJson
      )
    );

    throw new HttpsError(
      "internal",
      "Meta did not return an upload session id"
    );
  }

  /*
   * STEP 2
   * העלאת הקובץ עצמו.
   *
   * התוצאה אמורה לכלול handle בשדה h.
   */
  const uploadResponse =
    await fetch(
      `${META_GRAPH_URL}/${uploadSessionId}`,
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          file_offset:
            "0",

          "Content-Type":
            mimeType,
        },

        body:
          fileBuffer,
      }
    );

  const uploadJson:
    any =
    await uploadResponse.json();

  if (
    !uploadResponse.ok
  ) {
    console.error(
      "[uploadWhatsAppTemplateMedia] Meta upload error:",
      JSON.stringify(
        uploadJson
      )
    );

    throw new HttpsError(
      "failed-precondition",
      uploadJson?.error
        ?.error_user_msg ||
        uploadJson?.error
          ?.message ||
        "Failed to upload template media to Meta"
    );
  }

  const handle =
    s(
      uploadJson?.h
    );

  if (!handle) {
    console.error(
      "[uploadWhatsAppTemplateMedia] Meta did not return handle:",
      JSON.stringify(
        uploadJson
      )
    );

    throw new HttpsError(
      "internal",
      "Meta did not return a media handle"
    );
  }

  return {
    ok:
      true,

    agentId,

    mediaType,

    handle,

    storagePath,

    fileName,

    mimeType,

    size:
      fileBuffer.length,
  };
}
