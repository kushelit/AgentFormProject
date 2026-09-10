/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  createHash,
} from "node:crypto";

import {
  nowTs,
} from "./admin";

import {
  resolveMagicTouchContact,
} from "./magicTouchContactLookup";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizePhone(
  value: unknown
): string {
  const digits =
    s(
      value
    ).replace(
      /\D/g,
      ""
    );

  if (
    digits.startsWith(
      "972"
    )
  ) {
    return digits;
  }

  if (
    digits.startsWith(
      "0"
    )
  ) {
    return `972${digits.slice(1)}`;
  }

  if (
    digits.length ===
    9
  ) {
    return `972${digits}`;
  }

  return digits;
}

function buildWhatsAppContactId({
  agentId,
  phoneNormalized,
}: {
  agentId: string;
  phoneNormalized: string;
}): string {
  const hash =
    createHash(
      "sha256"
    )
      .update(
        `${agentId}:${phoneNormalized}`
      )
      .digest(
        "hex"
      )
      .slice(
        0,
        32
      );

  return `whatsapp_${hash}`;
}

export type MagicTouchWhatsAppContactMatch = {
  contactId: string;
  contactRef: FirebaseFirestore.DocumentReference;
  contactData: Record<string, any>;
  created: boolean;
};

export async function getOrCreateMagicTouchContactFromWhatsApp({
  db,
  agentId,
  phone,
  profileName,
  waId,
  conversationId,
}: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  phone: string;
  profileName?: string | null;
  waId?: string | null;
  conversationId?: string | null;
}): Promise<MagicTouchWhatsAppContactMatch> {
  const normalizedAgentId =
    s(
      agentId
    );

  const phoneNormalized =
    normalizePhone(
      phone
    );

  if (
    !normalizedAgentId ||
    !phoneNormalized
  ) {
    throw new Error(
      "Missing agentId or WhatsApp phone"
    );
  }

  /*
   * קודם משתמשים במנגנון החיפוש הקיים של MagicTouch.
   * כך לקוח שכבר קיים מ-Surense / Excel / MagicSale
   * לא ייווצר מחדש.
   */
  const existing =
    await resolveMagicTouchContact({
      db,

      agentId:
        normalizedAgentId,

      contactId:
        null,

      phone:
        phoneNormalized,
    });

  if (
    existing
  ) {
    return {
      contactId:
        existing.contactId,

      contactRef:
        existing.contactRef,

      contactData:
        existing.contactData as
          Record<string, any>,

      created:
        false,
    };
  }

  /*
   * ללקוח שמגיע לראשונה מ-WhatsApp משתמשים ב-ID
   * דטרמיניסטי לפי agentId+phone.
   * כך גם אם Meta שולחת את אותה פנייה פעמיים במקביל,
   * לא נוצרים שני מסמכי לקוח שונים עבור אותו מספר.
   */
  const contactId =
    buildWhatsAppContactId({
      agentId:
        normalizedAgentId,

      phoneNormalized,
    });

  const contactRef =
    db.doc(
      `agents/${normalizedAgentId}/magic_touch_contacts/${contactId}`
    );

  const existingWhatsAppContactSnap =
    await contactRef.get();

  if (
    existingWhatsAppContactSnap.exists
  ) {
    return {
      contactId,

      contactRef,

      contactData:
        existingWhatsAppContactSnap.data() as
          Record<string, any>,

      created:
        false,
    };
  }

  const normalizedProfileName =
    s(
      profileName
    );

  const normalizedWaId =
    normalizePhone(
      waId ||
      phoneNormalized
    ) ||
    phoneNormalized;

  const normalizedConversationId =
    s(
      conversationId
    );

  const timestamp =
    nowTs();

  /*
   * Meta נותנת לנו שם Profile מלא, אבל לא מפרידה
   * באופן אמין בין firstName ל-lastName.
   *
   * לכן שומרים את fullName כפי שהגיע, ולא מנחשים
   * שם פרטי. זה חשוב במיוחד לשמות מורכבים.
   */
  const contactData:
    Record<string, any> = {
      agentId:
        normalizedAgentId,

      contactId,

      fullName:
        normalizedProfileName,

      firstName:
        "",

      lastName:
        "",

      phone:
        phoneNormalized,

      phoneNormalized,

      email:
        null,

      emailNormalized:
        null,

      idNumber:
        null,

      birthDate:
        null,

      sourceSystem:
        "whatsapp",

      sourceRecordId:
        normalizedWaId,

      sourceData: {
        whatsapp: {
          waId:
            normalizedWaId,

          profileName:
            normalizedProfileName ||
            null,

          phoneNumber:
            phoneNormalized,

          conversationId:
            normalizedConversationId ||
            null,

          firstSeenAt:
            timestamp,
        },
      },

      engagement: {
        reengagement: {
          interestStatus:
            "pending",

          bookingStatus:
            "not_sent",
        },
      },

      interestStatus:
        "pending",

      appointmentStatus:
        "not_sent",

      whatsappConversationId:
        normalizedConversationId ||
        null,

      lastInboundAt:
        timestamp,

      createdAt:
        timestamp,

      updatedAt:
        timestamp,
    };

  await contactRef.create(
    contactData
  ).catch(
    async (
      error: any
    ) => {
      /*
       * create() מגן מפני דריסה.
       * אם במקביל כבר נוצר אותו מסמך,
       * נטען אותו ונמשיך רגיל.
       */
      if (
        Number(
          error?.code
        ) ===
          6 ||
        s(
          error?.code
        ) ===
          "already-exists"
      ) {
        return;
      }

      throw error;
    }
  );

  const finalSnap =
    await contactRef.get();

  if (
    !finalSnap.exists
  ) {
    throw new Error(
      "Failed to create WhatsApp MagicTouch contact"
    );
  }

  return {
    contactId,

    contactRef,

    contactData:
      finalSnap.data() as
        Record<string, any>,

    created:
      true,
  };
}
