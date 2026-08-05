/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";

import {
  adminDb,
} from "./shared/admin";

const TEST_PROJECT_ID =
  "magicsale-test";

const TEST_AGENT_ID =
  "5Ifm4d4Z5KMsXSnfaW37HcjPjj32";

const CONTACT_ID =
  "surense_73df361a8e734c949fc802bc419d521f";

const SURENSE_CUSTOMER_ID =
  "73df361a-8e73-4c94-9fc8-02bc419d521f";

const REQUIRED_CONFIRMATION =
  "RESET";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function resetSignedSurenseTestContactImpl(
  input: {
    uid: string | null;
    confirmation: unknown;
  }
): Promise<Record<string, unknown>> {
  const projectId =
    s(
      process.env.GCLOUD_PROJECT
    ) ||
    s(
      process.env.GOOGLE_CLOUD_PROJECT
    );

  if (
    projectId !==
    TEST_PROJECT_ID
  ) {
    throw new HttpsError(
      "failed-precondition",
      `This reset tool is allowed only in ${TEST_PROJECT_ID}`
    );
  }

  if (!input.uid) {
    throw new HttpsError(
      "unauthenticated",
      "A signed-in user is required"
    );
  }

  if (
    s(
      input.confirmation
    ) !==
    REQUIRED_CONFIRMATION
  ) {
    throw new HttpsError(
      "failed-precondition",
      `Type ${REQUIRED_CONFIRMATION} to confirm reset`
    );
  }

  const db =
    adminDb();

  const contactRef =
    db.doc(
      `agents/${TEST_AGENT_ID}/magic_touch_contacts/${CONTACT_ID}`
    );

  const contactSnap =
    await contactRef.get();

  if (!contactSnap.exists) {
    throw new HttpsError(
      "not-found",
      `Test contact was not found: ${contactRef.path}`
    );
  }

  const contact =
    contactSnap.data() || {};

  if (
    s(contact.agentId) !==
    TEST_AGENT_ID
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Contact agentId does not match the configured test agent"
    );
  }

  if (
    s(contact.sourceRecordId) !==
    SURENSE_CUSTOMER_ID
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Contact is not linked to the configured signed Surense customer"
    );
  }

  const now =
    Timestamp.now();

 await contactRef.update({
  "engagement.reengagement.powerOfAttorney.status":
    "waiting_for_signature",

  "sourceData.surense.statusName":
    "ממתין לחתימה",

  "engagement.reengagement.powerOfAttorney.requestedAt":
    Timestamp.fromMillis(
      Date.now() -
      25 * 60 * 60 * 1000
    ),

  "engagement.reengagement.powerOfAttorney.lastCheckedAt":
    null,

  "engagement.reengagement.powerOfAttorney.signedAt":
    FieldValue.delete(),

  "engagement.reengagement.powerOfAttorney.reminderDue":
    false,

  "engagement.reengagement.powerOfAttorney.reminderCount":
    0,

  "engagement.reengagement.powerOfAttorney.lastReminderSentAt":
    null,

  "engagement.reengagement.powerOfAttorney.reminderQueuedAt":
    FieldValue.delete(),

  "engagement.reengagement.powerOfAttorney.signature.hb":
    false,

  "engagement.reengagement.powerOfAttorney.signature.policies":
    false,

  "engagement.reengagement.powerOfAttorney.signature.swiftness":
    false,

  "engagement.reengagement.powerOfAttorney.signatureDates.hbProxySignDate":
    null,

  "engagement.reengagement.powerOfAttorney.signatureDates.policiesProxySignDate":
    null,

  "engagement.reengagement.powerOfAttorney.signatureDates.swiftnessProxySignDate":
    null,

  "engagement.reengagement.powerOfAttorney.updatedAt":
    now,

  updatedAt:
    now,
});

  return {
    ok:
      true,

    reset:
      true,

    projectId,

    agentId:
      TEST_AGENT_ID,

    contactId:
      CONTACT_ID,

    contactPath:
      contactRef.path,

    surenseCustomerId:
      SURENSE_CUSTOMER_ID,

    powerOfAttorneyStatus:
      "waiting_for_signature",
  };
}
