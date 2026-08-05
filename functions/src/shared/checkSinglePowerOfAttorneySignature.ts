/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import { adminDb } from "./admin";
import { executeSurenseAction } from "./surenseIntegrationService";

const s = (value: unknown): string =>
  String(value ?? "").trim();

const asRecord = (
  value: unknown
): Record<string, any> =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value)
    ? value as Record<string, any>
    : {};

function toMillis(value: unknown): number | null {
  if (!value) return null;

  if (
    typeof (value as any)?.toMillis ===
    "function"
  ) {
    return (value as any).toMillis();
  }

  if (
    typeof (value as any)?.toDate ===
    "function"
  ) {
    return (value as any).toDate().getTime();
  }

  const parsed =
    new Date(value as any);

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed.getTime();
}

function toSignedTimestamp(
  values: Array<string | null>,
  fallback: Timestamp
): Timestamp {
  const validTimes =
    values
      .filter(Boolean)
      .map(
        (value) =>
          new Date(String(value))
      )
      .filter(
        (date) =>
          !Number.isNaN(
            date.getTime()
          )
      )
      .map(
        (date) =>
          date.getTime()
      );

  if (!validTimes.length) {
    return fallback;
  }

  return Timestamp.fromMillis(
    Math.max(...validTimes)
  );
}

export type PowerOfAttorneySignatureStatus =
  | "waiting_for_signature"
  | "partially_signed"
  | "signed";

export type CheckSinglePowerOfAttorneySignatureResult = {
  agentId: string;
  contactId: string;
  surenseCustomerId: string;
  previousStatus: string | null;
  status: PowerOfAttorneySignatureStatus;
  fullySigned: boolean;
  partiallySigned: boolean;
  changedToSigned: boolean;
  reminderDue: boolean;
  reminderAlreadySent: boolean;
  signature: {
    hb: boolean;
    policies: boolean;
    swiftness: boolean;
  };
  signatureDates: {
    hbProxySignDate: string | null;
    policiesProxySignDate: string | null;
    swiftnessProxySignDate: string | null;
  };
};

export async function checkSinglePowerOfAttorneySignature(
  input: {
    agentId: string;
    contactId: string;
  }
): Promise<CheckSinglePowerOfAttorneySignatureResult> {
  const agentId =
    s(input.agentId);

  const contactId =
    s(input.contactId);

  if (!agentId || !contactId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId or contactId"
    );
  }

  const db =
    adminDb();

  const contactRef =
    db.doc(
      `agents/${agentId}/magic_touch_contacts/${contactId}`
    );

  const contactSnap =
    await contactRef.get();

  if (!contactSnap.exists) {
    throw new HttpsError(
      "not-found",
      "MagicTouch contact was not found"
    );
  }

  const contact =
    contactSnap.data() as
      Record<string, any>;

  /*
   * הגנה מפני התאמה שגויה בין לקוח לסוכן.
   * השדה agentId במסמך חייב להתאים ל-agentId שבנתיב.
   */
  const storedAgentId =
    s(contact?.agentId);

  if (!storedAgentId) {
    throw new HttpsError(
      "failed-precondition",
      "Contact is missing agentId"
    );
  }

  if (storedAgentId !== agentId) {
    throw new HttpsError(
      "failed-precondition",
      "Contact agentId does not match document owner"
    );
  }

  if (
    s(contact?.sourceSystem) !==
    "surense"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Contact is not linked to Surense"
    );
  }

  const powerOfAttorney =
    asRecord(
      contact
        ?.engagement
        ?.reengagement
        ?.powerOfAttorney
    );

  const previousStatus =
    s(powerOfAttorney?.status) ||
    null;

  if (
    previousStatus !==
      "waiting_for_signature" &&
    previousStatus !==
      "partially_signed"
  ) {
    throw new HttpsError(
      "failed-precondition",
      `Contact is not waiting for signature: ${
        previousStatus ||
        "missing_status"
      }`
    );
  }

  const surenseCustomerId =
    s(contact?.sourceRecordId) ||
    s(
      contact
        ?.sourceData
        ?.customerId
    ) ||
    s(
      contact
        ?.sourceData
        ?.surense
        ?.customerId
    );

  if (!surenseCustomerId) {
    throw new HttpsError(
      "failed-precondition",
      "Contact is missing Surense customer ID"
    );
  }

  const result =
    await executeSurenseAction({
      agentId,
      action:
        "getCustomer",
      payload: {
        requestId:
          [
            "power_of_attorney_status_check",
            contactId,
            Date.now(),
          ].join(":"),
        contactId,
        surenseCustomerId,
      },
    });

  const response =
    asRecord(
      result.response
    );

  const hbProxySignDate =
    s(response?.hbProxySignDate) ||
    null;

  const policiesProxySignDate =
    s(
      response
        ?.policiesProxySignDate
    ) ||
    null;

  const swiftnessProxySignDate =
    s(
      response
        ?.swiftnessProxySignDate
    ) ||
    null;

  const included =
    asRecord(
      powerOfAttorney?.included
    );

  const requiresHb =
    included?.hb !== false;

  const requiresPolicies =
    included?.policies !== false;

  const requiresSwiftness =
    included?.swiftness !== false;

  const hbSigned =
    Boolean(hbProxySignDate);

  const policiesSigned =
    Boolean(
      policiesProxySignDate
    );

  const swiftnessSigned =
    Boolean(
      swiftnessProxySignDate
    );

  const hbCompleted =
    !requiresHb ||
    hbSigned;

  const policiesCompleted =
    !requiresPolicies ||
    policiesSigned;

  const swiftnessCompleted =
    !requiresSwiftness ||
    swiftnessSigned;

  const fullySigned =
    hbCompleted &&
    policiesCompleted &&
    swiftnessCompleted;

  const partiallySigned =
    !fullySigned &&
    (
      (
        requiresHb &&
        hbSigned
      ) ||
      (
        requiresPolicies &&
        policiesSigned
      ) ||
      (
        requiresSwiftness &&
        swiftnessSigned
      )
    );

  const status:
    PowerOfAttorneySignatureStatus =
    fullySigned
      ? "signed"
      : partiallySigned
        ? "partially_signed"
        : "waiting_for_signature";

  const checkedAt =
    Timestamp.now();

  const requestedAtMs =
    toMillis(
      powerOfAttorney?.requestedAt
    );

  const reminderCount =
    Number(
      powerOfAttorney?.reminderCount ||
      0
    );

  const reminderAlreadySent =
    reminderCount > 0 ||
    Boolean(
      powerOfAttorney
        ?.lastReminderSentAt
    );

  const elapsedMs =
    requestedAtMs === null
      ? 0
      : checkedAt.toMillis() -
        requestedAtMs;

  const reminderDue =
    !fullySigned &&
    !reminderAlreadySent &&
    elapsedMs >=
      24 *
      60 *
      60 *
      1000;
      
const changedToSigned =
  fullySigned;

  const updates:
    Record<string, unknown> = {
      "engagement.reengagement.powerOfAttorney.status":
        status,

      "engagement.reengagement.powerOfAttorney.lastCheckedAt":
        checkedAt,

      "engagement.reengagement.powerOfAttorney.signature.hb":
        hbSigned,

      "engagement.reengagement.powerOfAttorney.signature.policies":
        policiesSigned,

      "engagement.reengagement.powerOfAttorney.signature.swiftness":
        swiftnessSigned,

      "engagement.reengagement.powerOfAttorney.signatureDates.hbProxySignDate":
        hbProxySignDate,

      "engagement.reengagement.powerOfAttorney.signatureDates.policiesProxySignDate":
        policiesProxySignDate,

      "engagement.reengagement.powerOfAttorney.signatureDates.swiftnessProxySignDate":
        swiftnessProxySignDate,

      "engagement.reengagement.powerOfAttorney.reminderDue":
        reminderDue,

      "engagement.reengagement.powerOfAttorney.updatedAt":
        checkedAt,

      updatedAt:
        checkedAt,
    };

  if (fullySigned) {
    updates[
      "engagement.reengagement.powerOfAttorney.signedAt"
    ] =
      toSignedTimestamp(
        [
          hbProxySignDate,
          policiesProxySignDate,
          swiftnessProxySignDate,
        ],
        checkedAt
      );

    updates[
      "engagement.reengagement.powerOfAttorney.reminderDue"
    ] =
      false;

    updates[
      "engagement.reengagement.powerOfAttorney.reminderQueuedAt"
    ] =
      FieldValue.delete();
  }

  await contactRef.update(
    updates
  );

  return {
    agentId,
    contactId,
    surenseCustomerId,
    previousStatus,
    status,
    fullySigned,
    partiallySigned,
    changedToSigned,
    reminderDue,
    reminderAlreadySent,
    signature: {
      hb:
        hbSigned,
      policies:
        policiesSigned,
      swiftness:
        swiftnessSigned,
    },
    signatureDates: {
      hbProxySignDate,
      policiesProxySignDate,
      swiftnessProxySignDate,
    },
  };
}
