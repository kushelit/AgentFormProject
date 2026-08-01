/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb } from "./shared/admin";

function s(value: any): string {
  return String(value ?? "").trim();
}

function toMillisOrNull(value: any): number | null {
  if (!value) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = new Date(value).getTime();

  return Number.isNaN(parsed)
    ? null
    : parsed;
}

export async function getMagicTouchContactsImpl(
  req: any
): Promise<object> {
  const authUid = s(req.auth?.uid);

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

  const userData = userSnap.data() as any;

  const isAdmin =
    userData?.role === "admin" ||
    userData?.isSystem === true;

  const userAgentId =
    s(userData?.agentId) ||
    authUid;

  const requestedAgentId =
    s(req.data?.agentId);

  /*
   * Admin יכול לבקש agentId אחר.
   * משתמש רגיל יכול לקרוא רק את אנשי הקשר של הסוכן שלו.
   */
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
      "Cannot read Magic Touch contacts for another agent"
    );
  }

  const requestedLimit =
    Number(req.data?.limit ?? 500);

  const limit =
    Number.isInteger(requestedLimit) &&
    requestedLimit > 0
      ? Math.min(requestedLimit, 500)
      : 500;

  const snap = await (db as any)
    .collection(
      `agents/${agentId}/magic_touch_contacts`
    )
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const contacts = snap.docs.map(
    (doc: any) => {
      const data = doc.data() as any;

      const surenseData =
        data?.sourceData?.surense &&
        typeof data.sourceData.surense === "object"
          ? data.sourceData.surense
          : null;

      const magicSaleData =
        data?.sourceData?.magicsale &&
        typeof data.sourceData.magicsale === "object"
          ? data.sourceData.magicsale
          : null;

      const excelData =
        data?.sourceData?.excel &&
        typeof data.sourceData.excel === "object"
          ? data.sourceData.excel
          : null;

      return {
        id: doc.id,
        contactId: doc.id,

        agentId:
          s(data.agentId) ||
          agentId,

        fullName:
          s(data.fullName),

        firstName:
          s(data.firstName),

        lastName:
          s(data.lastName),

        phone:
          s(data.phone),

        phoneNormalized:
          s(data.phoneNormalized),

        email:
          s(data.email) || null,

        emailNormalized:
          s(data.emailNormalized) || null,

        idNumber:
          s(data.idNumber) || null,

        gender:
          s(data.gender) || null,

        birthDate:
          s(data.birthDate) || null,

        sourceSystem:
          s(data.sourceSystem) || "other",

        sourceRecordId:
          s(data.sourceRecordId) || null,

        sourceData: {
          surense: surenseData
            ? {
                customerId:
                  s(surenseData.customerId) || null,

                workflowId:
                  s(surenseData.workflowId) || null,

                statusName:
                  s(surenseData.statusName) || null,

                statusActive:
                  typeof surenseData.statusActive === "boolean"
                    ? surenseData.statusActive
                    : null,

                lastActivityDate:
                  s(surenseData.lastActivityDate) || null,
              }
            : null,

          magicsale: magicSaleData
            ? {
                customerDocId:
                  s(magicSaleData.customerDocId) || null,

                customerId:
                  s(magicSaleData.customerId) || null,
              }
            : null,

          excel: excelData
            ? {
                importRunId:
                  s(excelData.importRunId) || null,

                fileName:
                  s(excelData.fileName) || null,
              }
            : null,
        },

        contactStatus:
          s(data.contactStatus) || "active",

        interestStatus:
          s(data.interestStatus) || "unknown",

        appointmentStatus:
          s(data.appointmentStatus) || "not_sent",

        appointmentProvider:
          s(data.appointmentProvider) || null,

        consentStatus:
          s(data.consentStatus) || "unknown",

        tags:
          Array.isArray(data.tags)
            ? data.tags
                .map((tag: any) => s(tag))
                .filter(Boolean)
            : [],

        notes:
          s(data.notes) || null,

        lastInboundAt:
          toMillisOrNull(data.lastInboundAt),

        lastOutboundAt:
          toMillisOrNull(data.lastOutboundAt),

        lastReplyText:
          s(data.lastReplyText) || null,

        sourceLastSyncedAt:
          toMillisOrNull(
            data.sourceLastSyncedAt
          ),

        createdAt:
          toMillisOrNull(data.createdAt),

        updatedAt:
          toMillisOrNull(data.updatedAt),
      };
    }
  );

  const stats = {
    total: contacts.length,

    bySource: {} as Record<string, number>,

    byContactStatus:
      {} as Record<string, number>,

    byInterestStatus:
      {} as Record<string, number>,

    byAppointmentStatus:
      {} as Record<string, number>,

    withPhone: 0,
    withoutPhone: 0,

    withEmail: 0,
    withoutEmail: 0,
  };

  for (const contact of contacts) {
    const sourceSystem =
      contact.sourceSystem || "other";

    const contactStatus =
      contact.contactStatus || "active";

    const interestStatus =
      contact.interestStatus || "unknown";

    const appointmentStatus =
      contact.appointmentStatus || "not_sent";

    stats.bySource[sourceSystem] =
      (stats.bySource[sourceSystem] || 0) + 1;

    stats.byContactStatus[contactStatus] =
      (stats.byContactStatus[contactStatus] || 0) + 1;

    stats.byInterestStatus[interestStatus] =
      (stats.byInterestStatus[interestStatus] || 0) + 1;

    stats.byAppointmentStatus[appointmentStatus] =
      (stats.byAppointmentStatus[appointmentStatus] || 0) + 1;

    if (contact.phoneNormalized) {
      stats.withPhone++;
    } else {
      stats.withoutPhone++;
    }

    if (contact.emailNormalized) {
      stats.withEmail++;
    } else {
      stats.withoutEmail++;
    }
  }

  return {
    ok: true,
    agentId,
    contacts,
    stats,
    count: contacts.length,
    limit,
  };
}