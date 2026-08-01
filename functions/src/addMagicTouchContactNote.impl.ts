/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";

import { adminDb, nowTs } from "./shared/admin";
import { safeString } from "./shared/magicTouchContacts";
import {
  requireBackendPermission,
} from "./shared/backendPermissions";

import {
  addMagicTouchTimelineEvent,
} from "./shared/magicTouchTimelineService";

export async function addMagicTouchContactNoteImpl(
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
    userId: authUid,
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

  const requestedAgentId =
    safeString(
      req.data?.agentId
    );

  const agentId =
    requestedAgentId ||
    userAgentId;

  const contactId =
    safeString(
      req.data?.contactId
    );

  const note =
    safeString(
      req.data?.note
    );

  if (
    !agentId ||
    !contactId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId or contactId"
    );
  }

  if (!note) {
    throw new HttpsError(
      "invalid-argument",
      "Missing note"
    );
  }

  if (
    note.length >
    5000
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Note is too long"
    );
  }

  if (
    !isAdmin &&
    agentId !==
      userAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot update a contact for another agent"
    );
  }

  try {
    const event =
      await addMagicTouchTimelineEvent({
        agentId,
        contactId,

        type:
          "note_added",

        channel:
          "internal",

        title:
          "נוספה הערה",

        description:
          note,

        direction:
          "internal",

        status:
          "completed",

        createdBy:
          authUid,

        metadata: {
          authorName:
            safeString(
              userData?.name
            ) ||
            null,

          authorRole:
            safeString(
              userData?.role
            ) ||
            null,
        },
      });

    const contactRef =
      (db as any).doc(
        `agents/${agentId}/magic_touch_contacts/${contactId}`
      );

    await contactRef.set(
      {
        notes:
          note,

        lastNoteAt:
          nowTs(),

        lastNoteBy:
          authUid,

        updatedAt:
          nowTs(),
      },
      {
        merge: true,
      }
    );

    return {
      ok: true,

      agentId,
      contactId,

      eventId:
        event.eventId,
    };
  } catch (error: any) {
    console.error(
      "[addMagicTouchContactNote] Failed",
      {
        authUid,
        agentId,
        contactId,

        error:
          error?.message ||
          String(error),
      }
    );

    if (
      error?.message ===
      "Magic Touch contact was not found"
    ) {
      throw new HttpsError(
        "not-found",
        error.message
      );
    }

    if (
      error instanceof
      HttpsError
    ) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      error?.message ||
        "Failed to add contact note"
    );
  }
}