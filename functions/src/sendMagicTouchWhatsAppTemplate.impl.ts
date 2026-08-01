/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";

import { adminDb } from "./shared/admin";
import { safeString } from "./shared/magicTouchContacts";
import { requireBackendPermission } from "./shared/backendPermissions";

import {
  loadMagicTouchWhatsAppTemplateContext,
  sendMagicTouchTemplateToContact,
} from "./shared/sendMagicTouchWhatsAppTemplateService";

export async function sendMagicTouchWhatsAppTemplateImpl(
  req: any
): Promise<object> {
  const authUid =
    safeString(
      req.auth?.uid
    );

  if (!authUid) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const requestedAgentId =
    safeString(
      req.data?.agentId
    );

  const contactId =
    safeString(
      req.data?.contactId
    );

  const conversationId =
    safeString(
      req.data?.conversationId
    );

  const templateName =
    safeString(
      req.data?.templateName
    );

  if (!contactId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing contactId"
    );
  }

  if (!templateName) {
    throw new HttpsError(
      "invalid-argument",
      "Missing templateName"
    );
  }

  const db =
    adminDb();

  const userSnap =
    await (db as any)
      .collection("users")
      .doc(authUid)
      .get();

  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() as any;

  await requireBackendPermission({
    db: db as any,
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
    safeString(
      userData?.agentId
    ) ||
    authUid;

  const agentId =
    requestedAgentId ||
    userAgentId;

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (
    !isAdmin &&
    agentId !== userAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot send WhatsApp messages for another agent"
    );
  }

  const context =
    await loadMagicTouchWhatsAppTemplateContext({
      db: db as any,
      agentId,
      templateName,
    });

  const result =
    await sendMagicTouchTemplateToContact({
      db: db as any,
      context,

      contactId,
      createdBy:
        authUid,

      conversationId:
        conversationId ||
        null,
    });

  return {
    ok:
      true,

    ...result,
  };
}