/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  Timestamp,
} from "firebase-admin/firestore";

import {
  adminDb,
} from "./shared/admin";

const TEST_PROJECT_ID =
  "magicsale-test";

const TEST_AGENT_ID =
  "5Ifm4d4Z5KMsXSnfaW37HcjPjj32";

const SURENSE_CUSTOMER_ID =
  "73df361a-8e73-4c94-9fc8-02bc419d521f";

const CONTACT_ID =
  "surense_73df361a8e734c949fc802bc419d521f";

const REQUIRED_CONFIRMATION =
  "CREATE";

const TEST_PHONE =
  "0559977758";

const TEST_PHONE_NORMALIZED =
  "972559977758";

const TEST_EMAIL =
  "naamac1702@gmail.com";

const DEFAULT_WORKFLOW_ID =
  "REPLACE_ME_WITH_REAL_SURENSE_WORKFLOW_ID";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function createSignedSurenseTestContactImpl(
  input: {
    uid: string | null;
    confirmation: unknown;
    workflowId: unknown;
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
      `This seed tool is allowed only in ${TEST_PROJECT_ID}`
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
      `Type ${REQUIRED_CONFIRMATION} to confirm creation`
    );
  }

  const workflowId =
    s(
      input.workflowId
    ) ||
    DEFAULT_WORKFLOW_ID;

  const db =
    adminDb();

  const contactRef =
    db.doc(
      `agents/${TEST_AGENT_ID}/magic_touch_contacts/${CONTACT_ID}`
    );

  const existingSnap =
    await contactRef.get();

  if (
    existingSnap.exists
  ) {
    throw new HttpsError(
      "already-exists",
      `Test contact already exists: ${contactRef.path}`
    );
  }

  const now =
    Timestamp.now();

  await contactRef.create({
    agentId:
      TEST_AGENT_ID,

    appointmentProvider:
      null,

    appointmentStatus:
      "not_sent",

    consentStatus:
      "unknown",

    contactStatus:
      "active",

    firstName:
      "נעמה",

    lastName:
      "",

    fullName:
      "נעמה - לקוח חתום לבדיקה",

    email:
      TEST_EMAIL,

    emailNormalized:
      TEST_EMAIL.toLowerCase(),

    phone:
      TEST_PHONE,

    phoneNormalized:
      TEST_PHONE_NORMALIZED,

    interestStatus:
      "unknown",

    notes:
      "לקוח בדיקה ידני לזיהוי חתימה קיימת בשורנס.",

    sourceSystem:
      "surense",

    sourceRecordId:
      SURENSE_CUSTOMER_ID,

    sourceData: {
      surense: {
        customerId:
          SURENSE_CUSTOMER_ID,

        workflowId,

        statusName:
          "לקוח בדיקה חתום",

        statusActive:
          true,

        lastActivityDate:
          null,
      },
    },

    sourceLastSyncedAt:
      now,

    tags: [
      "surense",
      "test",
      "signed-source",
    ],

    engagement: {
      reengagement: {
        status:
          "booked",

        bookingStatus:
          "booked",

        interestStatus:
          "interested",

        powerOfAttorney: {
          status:
            "waiting_for_signature",

          requestedAt:
            now,

          lastCheckedAt:
            null,

          signedAt:
            null,

          reminderDue:
            false,

          reminderCount:
            0,

          lastReminderSentAt:
            null,

          signingUrl:
            null,

          message:
            null,

          source:
            "surense",

          requestId:
            "manual_signed_customer_seed",

          included: {
            hb:
              true,

            policies:
              true,

            swiftness:
              true,
          },

          signature: {
            hb:
              false,

            policies:
              false,

            swiftness:
              false,
          },

          signatureDates: {
            hbProxySignDate:
              null,

            policiesProxySignDate:
              null,

            swiftnessProxySignDate:
              null,
          },
        },

        updatedAt:
          now,
      },
    },

    createdAt:
      now,

    updatedAt:
      now,
  });

  return {
    ok:
      true,

    created:
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

    workflowId,

    phone:
      TEST_PHONE,

    email:
      TEST_EMAIL,

    powerOfAttorneyStatus:
      "waiting_for_signature",
  };
}
