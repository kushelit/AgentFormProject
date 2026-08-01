/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminDb, nowTs } from "./admin";

export type MagicTouchTimelineDirection =
  | "inbound"
  | "outbound"
  | "internal"
  | null;

export type MagicTouchTimelineStatus =
  | "pending"
  | "completed"
  | "failed"
  | "cancelled";

export type AddMagicTouchTimelineEventInput = {
  agentId: string;
  contactId: string;

  type: string;
  channel: string;

  title: string;
  description?: string | null;

  direction?: MagicTouchTimelineDirection;
  status?: MagicTouchTimelineStatus;

  createdBy: string;

  metadata?: Record<string, any>;

  sourceSystem?: string | null;
  sourceRecordId?: string | null;
};

export type AddMagicTouchTimelineEventResult = {
  eventId: string;
  agentId: string;
  contactId: string;
};

function s(value: any): string {
  return String(value ?? "").trim();
}

function cleanMetadata(
  value: any
): Record<string, any> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value;
}

export async function addMagicTouchTimelineEvent(
  input: AddMagicTouchTimelineEventInput
): Promise<AddMagicTouchTimelineEventResult> {
  const agentId =
    s(input.agentId);

  const contactId =
    s(input.contactId);

  const type =
    s(input.type);

  const channel =
    s(input.channel);

  const title =
    s(input.title);

  const createdBy =
    s(input.createdBy);

  if (
    !agentId ||
    !contactId
  ) {
    throw new Error(
      "Missing agentId or contactId"
    );
  }

  if (
    !type ||
    !channel ||
    !title
  ) {
    throw new Error(
      "Missing timeline event type, channel or title"
    );
  }

  if (!createdBy) {
    throw new Error(
      "Missing createdBy"
    );
  }

  const db =
    adminDb();

  const contactRef =
    (db as any).doc(
      `agents/${agentId}/magic_touch_contacts/${contactId}`
    );

  const eventRef =
    contactRef
      .collection("timeline")
      .doc();

  const timestamp =
    nowTs();

  const eventData = {
    eventId:
      eventRef.id,

    agentId,
    contactId,

    type,
    channel,

    title,

    description:
      s(input.description) ||
      null,

    direction:
      input.direction ??
      null,

    status:
      input.status ||
      "completed",

    sourceSystem:
      s(input.sourceSystem) ||
      null,

    sourceRecordId:
      s(input.sourceRecordId) ||
      null,

    metadata:
      cleanMetadata(
        input.metadata
      ),

    createdBy,

    occurredAt:
      timestamp,

    createdAt:
      timestamp,

    updatedAt:
      timestamp,
  };

  await (db as any).runTransaction(
    async (transaction: any) => {
      const contactSnap =
        await transaction.get(
          contactRef
        );

      if (!contactSnap.exists) {
        throw new Error(
          "Magic Touch contact was not found"
        );
      }

      transaction.set(
        eventRef,
        eventData
      );

      transaction.set(
        contactRef,
        {
          lastTimelineEventAt:
            timestamp,

          lastTimelineEventType:
            type,

          updatedAt:
            timestamp,
        },
        {
          merge: true,
        }
      );
    }
  );

  return {
    eventId:
      eventRef.id,

    agentId,
    contactId,
  };
}