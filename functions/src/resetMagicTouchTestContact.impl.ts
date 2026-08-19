/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./shared/admin";

const TEST_PROJECT_ID = "magicsale-test";
const TEST_AGENT_ID = "5Ifm4d4Z5KMsXSnfaW37HcjPjj32";
const TEST_CONTACT_ID = "surense_6bcaff93c0b496b433dd073d4723be2e";
const REQUIRED_CONFIRMATION = "RESET";

type ResetMode = "preview" | "apply";

type Input = {
  uid: string | null;
  mode: unknown;
  confirmation: unknown;
};

type DeleteCandidate = {
  path: string;
  label: string;
};

function s(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown): string {
  return s(value).replace(/\D/g, "");
}

async function addQueryResults(params: {
  label: string;
  query: FirebaseFirestore.Query;
  candidates: Map<string, DeleteCandidate>;
}): Promise<void> {
  const snap = await params.query.get();

  for (const doc of snap.docs) {
    params.candidates.set(doc.ref.path, {
      path: doc.ref.path,
      label: params.label,
    });
  }
}

async function addByField(params: {
  collectionPath: string;
  label: string;
  field: string;
  value: string;
  candidates: Map<string, DeleteCandidate>;
}): Promise<void> {
  if (!params.value) return;

  const db = adminDb();

  await addQueryResults({
    label: params.label,
    query: db
      .collection(params.collectionPath)
      .where(params.field, "==", params.value),
    candidates: params.candidates,
  });
}

async function collectCandidates(): Promise<{
  candidates: Map<string, DeleteCandidate>;
  conversationId: string;
  phoneNormalized: string;
}> {
  const db = adminDb();

  const contactRef = db.doc(
    `agents/${TEST_AGENT_ID}/magic_touch_contacts/${TEST_CONTACT_ID}`
  );
  const contactSnap = await contactRef.get();

  if (!contactSnap.exists) {
    throw new HttpsError(
      "not-found",
      `Test contact was not found: ${contactRef.path}`
    );
  }

  const contact = contactSnap.data() || {};

  const phoneNormalized = normalizePhone(
    contact.phoneNormalized || contact.phone
  );

  const conversationId =
    s(contact.whatsappConversationId) ||
    (phoneNormalized
      ? `${TEST_AGENT_ID}_${phoneNormalized}`
      : "");

  const candidates = new Map<string, DeleteCandidate>();

  const agentCollectionDefinitions = [
    {
      path: `agents/${TEST_AGENT_ID}/magic_touch_events`,
      label: "MagicTouch event",
    },
    {
      path: `agents/${TEST_AGENT_ID}/magic_touch_flow_runs`,
      label: "MagicTouch flow run",
    },
    {
      path: `agents/${TEST_AGENT_ID}/magic_touch_campaigns`,
      label: "MagicTouch campaign data",
    },
    {
      path: `agents/${TEST_AGENT_ID}/magic_touch_document_requests`,
      label: "MagicTouch document request",
    },
    {
      path: `agents/${TEST_AGENT_ID}/magic_touch_documents`,
      label: "MagicTouch document",
    },
  ];

  for (const definition of agentCollectionDefinitions) {
    await addByField({
      collectionPath: definition.path,
      label: definition.label,
      field: "contactId",
      value: TEST_CONTACT_ID,
      candidates,
    });

    await addByField({
      collectionPath: definition.path,
      label: definition.label,
      field: "conversationId",
      value: conversationId,
      candidates,
    });

    await addByField({
      collectionPath: definition.path,
      label: definition.label,
      field: "phoneNormalized",
      value: phoneNormalized,
      candidates,
    });
  }

  const rootDefinitions = [
    {
      path: "whatsapp_conversations",
      label: "WhatsApp conversation",
    },
    {
      path: "whatsapp_inbound_messages",
      label: "WhatsApp inbound message",
    },
  ];

  for (const definition of rootDefinitions) {
    await addByField({
      collectionPath: definition.path,
      label: definition.label,
      field: "contactId",
      value: TEST_CONTACT_ID,
      candidates,
    });

    await addByField({
      collectionPath: definition.path,
      label: definition.label,
      field: "conversationId",
      value: conversationId,
      candidates,
    });

    await addByField({
      collectionPath: definition.path,
      label: definition.label,
      field: "phoneNormalized",
      value: phoneNormalized,
      candidates,
    });

    await addByField({
      collectionPath: definition.path,
      label: definition.label,
      field: "from",
      value: phoneNormalized,
      candidates,
    });
  }

  await addByField({
    collectionPath:
      `agents/${TEST_AGENT_ID}/booking_appointments`,
    label: "Microsoft Bookings appointment",
    field: "contactId",
    value: TEST_CONTACT_ID,
    candidates,
  });

  if (conversationId) {
    const conversationRef = db.doc(
      `whatsapp_conversations/${conversationId}`
    );
    const conversationSnap = await conversationRef.get();

    if (conversationSnap.exists) {
      candidates.set(conversationRef.path, {
        path: conversationRef.path,
        label: "WhatsApp conversation",
      });
    }

    for (const subcollectionName of [
      "messages",
      "inbound_messages",
    ]) {
      const subSnap = await conversationRef
        .collection(subcollectionName)
        .get();

      for (const doc of subSnap.docs) {
        candidates.set(doc.ref.path, {
          path: doc.ref.path,
          label: `Conversation ${subcollectionName}`,
        });
      }
    }
  }

  for (const timelineName of [
    "timeline",
    "timeline_events",
    "magic_touch_timeline",
  ]) {
    const timelineSnap = await contactRef
      .collection(timelineName)
      .get();

    for (const doc of timelineSnap.docs) {
      candidates.set(doc.ref.path, {
        path: doc.ref.path,
        label: `Contact ${timelineName}`,
      });
    }
  }

  return {
    candidates,
    conversationId,
    phoneNormalized,
  };
}

async function deleteCandidates(
  candidates: Map<string, DeleteCandidate>
): Promise<void> {
  const db = adminDb();
  const writer = db.bulkWriter();

  for (const candidate of candidates.values()) {
    writer.delete(db.doc(candidate.path));
  }

  await writer.close();
}

async function resetContactFields(): Promise<void> {
  const db = adminDb();

  const contactRef = db.doc(
    `agents/${TEST_AGENT_ID}/magic_touch_contacts/${TEST_CONTACT_ID}`
  );

  await contactRef.update({
    "engagement.reengagement": FieldValue.delete(),

    lastCampaignId: FieldValue.delete(),
    campaignId: FieldValue.delete(),
    campaignStatus: FieldValue.delete(),

    whatsappConversationId: FieldValue.delete(),
    lastInboundAt: FieldValue.delete(),
    lastOutboundAt: FieldValue.delete(),
    lastReplyText: FieldValue.delete(),
    lastWhatsAppMessageId: FieldValue.delete(),
    lastWhatsAppInboundMessageId: FieldValue.delete(),

    appointmentProvider: null,
    appointmentStatus: "not_sent",
    interestStatus: "unknown",

    lastTimelineEventAt: FieldValue.delete(),
    lastTimelineEventType: FieldValue.delete(),

    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function resetMagicTouchTestContactImpl(
  input: Input
): Promise<Record<string, unknown>> {
  const projectId =
    s(process.env.GCLOUD_PROJECT) ||
    s(process.env.GOOGLE_CLOUD_PROJECT);

  if (projectId !== TEST_PROJECT_ID) {
    throw new HttpsError(
      "failed-precondition",
      `This cleanup tool is allowed only in ${TEST_PROJECT_ID}`
    );
  }

  if (!input.uid) {
    throw new HttpsError(
      "unauthenticated",
      "A signed-in user is required"
    );
  }

  const mode = s(input.mode) as ResetMode;

  if (mode !== "preview" && mode !== "apply") {
    throw new HttpsError(
      "invalid-argument",
      'mode must be either "preview" or "apply"'
    );
  }

  if (
    mode === "apply" &&
    s(input.confirmation) !== REQUIRED_CONFIRMATION
  ) {
    throw new HttpsError(
      "failed-precondition",
      `Type ${REQUIRED_CONFIRMATION} to confirm the reset`
    );
  }

  const {
    candidates,
    conversationId,
    phoneNormalized,
  } = await collectCandidates();

  const documents = [...candidates.values()].sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  if (mode === "preview") {
    return {
      ok: true,
      mode,
      projectId,
      agentId: TEST_AGENT_ID,
      contactId: TEST_CONTACT_ID,
      conversationId: conversationId || null,
      phoneNormalized: phoneNormalized || null,
      totalDocuments: documents.length,
      documents,
    };
  }

 await deleteCandidates(
  candidates
);

await resetContactFields();

await resetGoogleCalendarSyncState();

  return {
    ok: true,
    mode,
    projectId,
    agentId: TEST_AGENT_ID,
    contactId: TEST_CONTACT_ID,
    deletedDocuments: documents.length,
    message: "Test contact data was reset successfully",
  };
}

async function resetGoogleCalendarSyncState(): Promise<void> {
  const db = adminDb();

  const configRef = db.doc(
    `agents/${TEST_AGENT_ID}/config/googleCalendar`
  );

  const configSnap =
    await configRef.get();

  if (!configSnap.exists) {
    return;
  }

  await configRef.set(
    {
      lastSuccessfulSyncAtIso:
        FieldValue.delete(),

      lastSuccessfulSyncAt:
        FieldValue.delete(),

      lastSyncAt:
        FieldValue.delete(),

      lastSyncStartedAt:
        FieldValue.delete(),

      lastSyncCompletedAt:
        FieldValue.delete(),

      lastSyncFailedAt:
        FieldValue.delete(),

      lastSyncStatus:
        "not_started",

      lastSyncError:
        null,

      lastSyncScannedCount:
        FieldValue.delete(),

      lastSyncEventCount:
        FieldValue.delete(),

      lastSyncMatchedCount:
        FieldValue.delete(),

      lastSyncSkippedCount:
        FieldValue.delete(),

      lastSyncCancelledCount:
        FieldValue.delete(),

      lastSyncCustomerCandidateCount:
        FieldValue.delete(),

      updatedAt:
        FieldValue.serverTimestamp(),
    },
    {
      merge: true,
    }
  );
}