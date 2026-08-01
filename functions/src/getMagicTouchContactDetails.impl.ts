/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";

import { adminDb } from "./shared/admin";
import { safeString } from "./shared/magicTouchContacts";
import {
  requireBackendPermission,
} from "./shared/backendPermissions";

function toMillisOrNull(
  value: any
): number | null {
  if (!value) {
    return null;
  }

  if (
    typeof value === "number"
  ) {
    return value;
  }

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    value instanceof Date
  ) {
    return value.getTime();
  }

  const parsed =
    new Date(value).getTime();

  return Number.isNaN(parsed)
    ? null
    : parsed;
}

function serializeValue(
  value: any
): any {
  if (
    value === null ||
    value === undefined
  ) {
    return value ?? null;
  }

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    value instanceof Date
  ) {
    return value.getTime();
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      serializeValue
    );
  }

  if (
    typeof value === "object"
  ) {
    const result:
      Record<string, any> = {};

    for (
      const [
        key,
        nestedValue,
      ] of Object.entries(value)
    ) {
      result[key] =
        serializeValue(
          nestedValue
        );
    }

    return result;
  }

  return value;
}

export async function getMagicTouchContactDetailsImpl(
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

  const requestedLimit =
    Number(
      req.data?.timelineLimit
    );

  const timelineLimit =
    Number.isFinite(
      requestedLimit
    )
      ? Math.min(
          Math.max(
            Math.floor(
              requestedLimit
            ),
            1
          ),
          500
        )
      : 100;

  if (
    !agentId ||
    !contactId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId or contactId"
    );
  }

  if (
    !isAdmin &&
    agentId !==
      userAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot read a contact for another agent"
    );
  }

  const contactRef =
    (db as any).doc(
      `agents/${agentId}/magic_touch_contacts/${contactId}`
    );

  const contactSnap =
    await contactRef.get();

  if (!contactSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Magic Touch contact was not found"
    );
  }

  const timelineSnap =
    await contactRef
      .collection("timeline")
      .orderBy(
        "occurredAt",
        "desc"
      )
      .limit(
        timelineLimit
      )
      .get();

  const rawContact =
    contactSnap.data() as any;

  const contact = {
    id:
      contactSnap.id,

    contactId:
      contactSnap.id,

    ...serializeValue(
      rawContact
    ),

    createdAt:
      toMillisOrNull(
        rawContact?.createdAt
      ),

    updatedAt:
      toMillisOrNull(
        rawContact?.updatedAt
      ),

    sourceLastSyncedAt:
      toMillisOrNull(
        rawContact
          ?.sourceLastSyncedAt
      ),

    lastInboundAt:
      toMillisOrNull(
        rawContact?.lastInboundAt
      ),

    lastOutboundAt:
      toMillisOrNull(
        rawContact?.lastOutboundAt
      ),

    lastTimelineEventAt:
      toMillisOrNull(
        rawContact
          ?.lastTimelineEventAt
      ),
  };

  const timeline =
    timelineSnap.docs.map(
      (timelineDoc: any) => {
        const data =
          timelineDoc.data();

        return {
          id:
            timelineDoc.id,

          eventId:
            timelineDoc.id,

          ...serializeValue(
            data
          ),

          occurredAt:
            toMillisOrNull(
              data?.occurredAt
            ),

          createdAt:
            toMillisOrNull(
              data?.createdAt
            ),

          updatedAt:
            toMillisOrNull(
              data?.updatedAt
            ),
        };
      }
    );

  return {
    ok: true,

    agentId,
    contactId,

    contact,
    timeline,

    timelineCount:
      timeline.length,

    timelineLimit,
  };
}