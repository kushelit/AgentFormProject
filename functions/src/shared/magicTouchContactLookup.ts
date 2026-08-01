/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  safeString,
} from "./magicTouchContacts";

export type MagicTouchContactLookupResult = {
  contactId: string;
  contactRef: any;
  contactData: any;
};

function normalizePhone(
  phone: any
): string {
  const digits =
    safeString(phone)
      .replace(/\D/g, "");

  if (
    digits.startsWith("972")
  ) {
    return digits;
  }

  if (
    digits.startsWith("0")
  ) {
    return `972${digits.slice(1)}`;
  }

  if (
    digits.length === 9
  ) {
    return `972${digits}`;
  }

  return digits;
}

export async function findMagicTouchContactByPhone(
  db: any,
  agentId: string,
  phone: string
): Promise<MagicTouchContactLookupResult | null> {
  const normalizedAgentId =
    safeString(agentId);

  const phoneNormalized =
    normalizePhone(phone);

  if (
    !normalizedAgentId ||
    !phoneNormalized
  ) {
    return null;
  }

  const snap = await db
    .collection(
      `agents/${normalizedAgentId}/magic_touch_contacts`
    )
    .where(
      "phoneNormalized",
      "==",
      phoneNormalized
    )
    .limit(1)
    .get();

  if (snap.empty) {
    return null;
  }

  const contactDoc =
    snap.docs[0];

  return {
    contactId:
      contactDoc.id,

    contactRef:
      contactDoc.ref,

    contactData:
      contactDoc.data(),
  };
}

export async function findMagicTouchContactBySource({
  db,
  agentId,
  sourceSystem,
  sourceRecordId,
}: {
  db: any;
  agentId: string;
  sourceSystem: string;
  sourceRecordId: string;
}): Promise<MagicTouchContactLookupResult | null> {
  const normalizedAgentId =
    safeString(agentId);

  const normalizedSourceSystem =
    safeString(sourceSystem);

  const normalizedSourceRecordId =
    safeString(sourceRecordId);

  if (
    !normalizedAgentId ||
    !normalizedSourceSystem ||
    !normalizedSourceRecordId
  ) {
    return null;
  }

  const snap = await db
    .collection(
      `agents/${normalizedAgentId}/magic_touch_contacts`
    )
    .where(
      "sourceSystem",
      "==",
      normalizedSourceSystem
    )
    .where(
      "sourceRecordId",
      "==",
      normalizedSourceRecordId
    )
    .limit(1)
    .get();

  if (snap.empty) {
    return null;
  }

  const contactDoc =
    snap.docs[0];

  return {
    contactId:
      contactDoc.id,

    contactRef:
      contactDoc.ref,

    contactData:
      contactDoc.data(),
  };
}

export async function resolveMagicTouchContact({
  db,
  agentId,
  contactId,
  phone,
  sourceSystem,
  sourceRecordId,
}: {
  db: any;
  agentId: string;
  contactId?: string | null;
  phone?: string | null;
  sourceSystem?: string | null;
  sourceRecordId?: string | null;
}): Promise<MagicTouchContactLookupResult | null> {
  const normalizedAgentId =
    safeString(agentId);

  const normalizedContactId =
    safeString(contactId);

  if (
    normalizedAgentId &&
    normalizedContactId
  ) {
    const contactRef = db.doc(
      `agents/${normalizedAgentId}/magic_touch_contacts/${normalizedContactId}`
    );

    const contactSnap =
      await contactRef.get();

    if (contactSnap.exists) {
      return {
        contactId:
          contactSnap.id,

        contactRef,

        contactData:
          contactSnap.data(),
      };
    }
  }

  if (
    safeString(sourceSystem) &&
    safeString(sourceRecordId)
  ) {
    const sourceMatch =
      await findMagicTouchContactBySource({
        db,
        agentId:
          normalizedAgentId,

        sourceSystem:
          safeString(sourceSystem),

        sourceRecordId:
          safeString(sourceRecordId),
      });

    if (sourceMatch) {
      return sourceMatch;
    }
  }

  if (safeString(phone)) {
    return findMagicTouchContactByPhone(
      db,
      normalizedAgentId,
      safeString(phone)
    );
  }

  return null;
}