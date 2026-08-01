/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";

import { adminDb } from "./shared/admin";
import { safeString } from "./shared/magicTouchContacts";
import { upsertMagicTouchContact } from "./shared/magicTouchContactService";

export async function createMagicTouchContactImpl(
  req: any
): Promise<object> {
  const authUid =
    safeString(req.auth?.uid);

  if (!authUid) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const db = adminDb();

  const userSnap = await (db as any)
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

  const isAdmin =
    userData?.role === "admin" ||
    userData?.isSystem === true;

  const userAgentId =
    safeString(userData?.agentId) ||
    authUid;

  const requestedAgentId =
    safeString(req.data?.agentId);

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
      "Cannot create a Magic Touch contact for another agent"
    );
  }

  const fullName =
    safeString(req.data?.fullName);

  const firstName =
    safeString(req.data?.firstName);

  const lastName =
    safeString(req.data?.lastName);

  const phone =
    safeString(req.data?.phone);

  const email =
    safeString(req.data?.email);

  const idNumber =
    safeString(req.data?.idNumber);

  const gender =
    safeString(req.data?.gender);

  const birthDate =
    safeString(req.data?.birthDate);

  const notes =
    safeString(req.data?.notes);

  const tags =
    Array.isArray(req.data?.tags)
      ? req.data.tags
          .map((value: any) =>
            safeString(value)
          )
          .filter(Boolean)
      : [];

  if (
    !fullName &&
    !firstName &&
    !lastName
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing contact name"
    );
  }

  if (!phone && !email) {
    throw new HttpsError(
      "invalid-argument",
      "A phone number or email address is required"
    );
  }

  const manualRecordId =
    randomUUID();

  try {
    const result =
      await upsertMagicTouchContact({
        agentId,

        sourceSystem:
          "manual",

        sourceRecordId:
          manualRecordId,

        fullName,

        firstName,

        lastName,

        phone,

        email,

        idNumber,

        gender,

        birthDate,

        tags: [
          "manual",
          ...tags,
        ],

        sourceData: {
          createdBy:
            authUid,
        },
      });

    /*
     * notes הוא שדה פנימי של Magic Touch ולא חלק
     * מנתוני המקור, ולכן נעדכן אותו לאחר יצירת הרשומה.
     */
    if (notes) {
      await (db as any)
        .doc(
          `agents/${agentId}/magic_touch_contacts/${result.contactId}`
        )
        .set(
          {
            notes,
          },
          {
            merge: true,
          }
        );
    }

    return {
      ok: true,
      agentId,
      ...result,
    };
  } catch (error: any) {
    console.error(
      "[createMagicTouchContact] Failed",
      {
        authUid,
        agentId,
        error:
          error?.message ||
          String(error),
      }
    );

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      error?.message ||
        "Failed to create Magic Touch contact"
    );
  }
}