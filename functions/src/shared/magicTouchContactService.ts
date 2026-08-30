/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  adminDb,
  nowTs,
} from "./admin";

import {
  createMagicTouchContactId,
  normalizeMagicTouchEmail,
  normalizeMagicTouchPhone,
  safeString,
  splitFullName,
  formatMagicTouchPhoneForDisplay,
  type MagicTouchSourceSystem,
} from "./magicTouchContacts";

export type MagicTouchContactSourceData =
  Record<string, any>;

export type UpsertMagicTouchContactInput = {
  agentId: string;

  sourceSystem:
    MagicTouchSourceSystem;

  sourceRecordId: string;

  sourceIdentity?: string;

  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;

  phone?: string | null;
  email?: string | null;

  idNumber?: string | null;
  gender?: string | null;
  birthDate?: string | null;

  sourceData?:
    MagicTouchContactSourceData;

  tags?: string[];
};

export type UpsertMagicTouchContactResult = {
  contactId: string;

  action:
    | "created"
    | "updated";

  sourceSystem:
    MagicTouchSourceSystem;

  sourceRecordId: string;
};

function normalizeTags(
  values: any
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map(
          (
            value
          ) =>
            safeString(
              value
            )
        )
        .filter(Boolean)
    )
  );
}

export async function upsertMagicTouchContact(
  input:
    UpsertMagicTouchContactInput
): Promise<UpsertMagicTouchContactResult> {
  const agentId =
    safeString(
      input.agentId
    );

  const sourceSystem =
    safeString(
      input.sourceSystem
    ).toLowerCase() as MagicTouchSourceSystem;

  const sourceRecordId =
    safeString(
      input.sourceRecordId
    );

  /*
   * ברירת המחדל היא שהזהות של Contact
   * חיצוני נקבעת לפי מזהה הרשומה
   * במערכת המקור.
   *
   * לדוגמה:
   * Surense Customer ID.
   */
  const sourceIdentity =
    safeString(
      input.sourceIdentity
    ) ||
    sourceRecordId;

  if (!agentId) {
    throw new Error(
      "Missing agentId"
    );
  }

  if (!sourceSystem) {
    throw new Error(
      "Missing sourceSystem"
    );
  }

  if (!sourceRecordId) {
    throw new Error(
      "Missing sourceRecordId"
    );
  }

  const fullName =
    safeString(
      input.fullName
    );

  const splitName =
    splitFullName(
      fullName
    );

  const firstName =
    safeString(
      input.firstName
    ) ||
    splitName.firstName;

  const lastName =
    safeString(
      input.lastName
    ) ||
    splitName.lastName;

  const rawPhone =
  safeString(
    input.phone
  );

const phone =
  formatMagicTouchPhoneForDisplay(
    rawPhone
  );

const phoneNormalized =
  normalizeMagicTouchPhone(
    rawPhone
  );

  const email =
    safeString(
      input.email
    );

  const emailNormalized =
    normalizeMagicTouchEmail(
      email
    );

  const idNumber =
    safeString(
      input.idNumber
    );

  const gender =
    safeString(
      input.gender
    );

  const birthDate =
    safeString(
      input.birthDate
    );

  const incomingTags =
    normalizeTags(
      input.tags
    );

  const sourceData =
    input.sourceData &&
    typeof input.sourceData ===
      "object"
      ? input.sourceData
      : {};

  /*
   * ה-contactId דטרמיניסטי לפי:
   *
   * sourceSystem + sourceIdentity
   *
   * לכן משיכה חוזרת של אותו
   * Surense Customer ID מגיעה
   * לאותו Contact ולא יוצרת כפילות.
   */
  const contactId =
    createMagicTouchContactId(
      sourceSystem,
      sourceIdentity
    );

  const db =
    adminDb();

  const contactRef =
    (db as any).doc(
      `agents/${agentId}/magic_touch_contacts/${contactId}`
    );

  const timestamp =
    nowTs();

  let action:
    | "created"
    | "updated" =
    "created";

  await (
    db as any
  ).runTransaction(
    async (
      transaction: any
    ) => {
      const existingSnap =
        await transaction.get(
          contactRef
        );

      const exists =
        existingSnap.exists;

      action =
        exists
          ? "updated"
          : "created";

      const existingData =
        exists
          ? existingSnap.data() ||
            {}
          : {};

      const existingSourceData =
        existingData.sourceData &&
        typeof existingData.sourceData ===
          "object"
          ? existingData.sourceData
          : {};

      const existingTags =
        normalizeTags(
          existingData.tags
        );

      const mergedTags =
        Array.from(
          new Set([
            ...existingTags,
            ...incomingTags,
          ])
        );

      /*
       * הנתונים שמגיעים עכשיו
       * ממערכת המקור מחליפים/מעדכנים
       * את אותם שדות במקור,
       * אבל לא מוחקים נתונים של
       * מערכות מקור אחרות.
       */
      const nextSourceData = {
        ...existingSourceData,

        [sourceSystem]: {
          ...(
            existingSourceData[
              sourceSystem
            ] ||
            {}
          ),

          ...sourceData,
        },
      };

      const commonFields:
        Record<
          string,
          any
        > = {
          agentId,

          fullName:
            fullName ||
            null,

          firstName:
            firstName ||
            null,

          lastName:
            lastName ||
            null,

          phone:
            phone ||
            null,

          phoneNormalized:
            phoneNormalized ||
            null,

          email:
            email ||
            null,

          emailNormalized:
            emailNormalized ||
            null,

          idNumber:
            idNumber ||
            null,

          gender:
            gender ||
            null,

          birthDate:
            birthDate ||
            null,

          sourceSystem,

          sourceRecordId,

          sourceData:
            nextSourceData,

          tags:
            mergedTags,

          sourceLastSyncedAt:
            timestamp,

          updatedAt:
            timestamp,
        };

      /*
       * Contact חדש.
       */
      if (!exists) {
        transaction.set(
          contactRef,
          {
            ...commonFields,

            contactStatus:
              "active",

            interestStatus:
              "unknown",

            appointmentStatus:
              "not_sent",

            appointmentProvider:
              null,

            consentStatus:
              "unknown",

            notes:
              null,

            lastInboundAt:
              null,

            lastOutboundAt:
              null,

            lastReplyText:
              null,

            createdAt:
              timestamp,
          }
        );

        return;
      }

      /*
       * Contact קיים:
       *
       * מעדכנים אותו במקום
       * ליצור Contact נוסף.
       */
      transaction.set(
        contactRef,
        commonFields,
        {
          merge: true,
        }
      );
    }
  );

  return {
    contactId,
    action,
    sourceSystem,
    sourceRecordId,
  };
}