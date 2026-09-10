/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  safeString,
} from "./shared/magicTouchContacts";

import {
  requireBackendPermission,
} from "./shared/backendPermissions";

function normalizePhone(
  value: string
): string {
  const digits =
    safeString(value).replace(
      /\D/g,
      ""
    );

  if (!digits) {
    return "";
  }

  /*
   * מספר ישראלי שכבר בפורמט בינלאומי.
   * לדוגמה:
   * 972501234567
   */
  if (
    digits.startsWith(
      "972"
    )
  ) {
    return digits;
  }

  /*
   * מספר ישראלי מקומי.
   * לדוגמה:
   * 0501234567
   *
   * הופך ל:
   * 972501234567
   */
  if (
    digits.startsWith(
      "0"
    )
  ) {
    return `972${digits.slice(
      1
    )}`;
  }

  /*
   * מספר ישראלי ללא 0 ראשון.
   * לדוגמה:
   * 501234567
   */
  if (
    digits.length ===
    9
  ) {
    return `972${digits}`;
  }

  return digits;
}

function normalizeEmail(
  value: string
): string {
  return safeString(
    value
  ).toLowerCase();
}

function wasProvided(
  value: unknown
): boolean {
  return value !==
    undefined;
}

export async function updateMagicTouchContactDetailsImpl(
  req: any
): Promise<object> {
  const authUid =
    safeString(
      req.auth?.uid
    );

  if (!authUid) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication required"
    );
  }

  const requestedAgentId =
    safeString(
      req.data?.agentId
    );

  const contactId =
    safeString(
      req.data?.contactId
    );

  if (!requestedAgentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (!contactId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing contactId"
    );
  }

  const db =
    adminDb();

  /*
   * קודם טוענים את המשתמש המחובר.
   */
  const userRef =
    (db as any)
      .collection(
        "users"
      )
      .doc(
        authUid
      );

  const userSnap =
    await userRef.get();

  if (
    !userSnap.exists
  ) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() ||
    {};

  /*
   * בדיקת הרשאת MagicTouch
   * לפי מנגנון ההרשאות האחיד של המערכת.
   */
  await requireBackendPermission({
    db,
    userId:
      authUid,
    permission:
      "access_magic_touch",
    userData,
  });

  /*
   * הגנה על הפרדת סוכנים:
   *
   * משתמש מערכת יכול לעבוד מול הסוכן
   * שנבחר במסך.
   *
   * משתמש רגיל יכול לערוך רק אנשי קשר
   * של agentId השייך אליו.
   */
  const isSystem =
    userData?.isSystem ===
    true;

  const userAgentId =
    safeString(
      userData?.agentId
    );

  if (
    !isSystem &&
    (!userAgentId ||
      userAgentId !==
        requestedAgentId)
  ) {
    throw new HttpsError(
      "permission-denied",
      "You do not have access to this agent"
    );
  }

  const contactRef =
    (db as any).doc(
      `agents/${requestedAgentId}/magic_touch_contacts/${contactId}`
    );

  const contactSnap =
    await contactRef.get();

  if (
    !contactSnap.exists
  ) {
    throw new HttpsError(
      "not-found",
      "MagicTouch contact not found"
    );
  }

  const currentContact =
    contactSnap.data() ||
    {};

  const updateData:
    Record<string, any> = {
      updatedAt:
        nowTs(),

      updatedBy:
        authUid,
    };

  /*
   * כל השדות החדשים אופציונליים.
   * כך הקריאות הישנות שמעדכנות רק טלפון/מייל
   * נשארות תקינות, וגם שינוי סטטוס בלבד
   * לא מאפס פרטים אחרים.
   */

  if (
    wasProvided(
      req.data?.fullName
    )
  ) {
    const fullName =
      safeString(
        req.data?.fullName
      );

    if (!fullName) {
      throw new HttpsError(
        "invalid-argument",
        "Full name is required"
      );
    }

    updateData.fullName =
      fullName;
  }

  if (
    wasProvided(
      req.data?.firstName
    )
  ) {
    updateData.firstName =
      safeString(
        req.data?.firstName
      );
  }

  if (
    wasProvided(
      req.data?.lastName
    )
  ) {
    updateData.lastName =
      safeString(
        req.data?.lastName
      );
  }

  if (
    wasProvided(
      req.data?.phone
    )
  ) {
    const phone =
      safeString(
        req.data?.phone
      );

    const phoneNormalized =
      normalizePhone(
        phone
      );

    /*
     * מונעים יצירת כפילות בטלפון
     * כאשר משנים את המספר של איש הקשר.
     */
    if (
      phoneNormalized &&
      phoneNormalized !==
        safeString(
          currentContact
            ?.phoneNormalized
        )
    ) {
      const duplicateQuery =
        await (db as any)
          .collection(
            `agents/${requestedAgentId}/magic_touch_contacts`
          )
          .where(
            "phoneNormalized",
            "==",
            phoneNormalized
          )
          .limit(
            2
          )
          .get();

      const duplicate =
        duplicateQuery.docs.find(
          (
            doc: any
          ) =>
            doc.id !==
            contactId
        );

      if (
        duplicate
      ) {
        throw new HttpsError(
          "already-exists",
          "קיים כבר איש קשר אחר עם מספר הטלפון הזה."
        );
      }
    }

    updateData.phone =
      phone ||
      "";

    updateData.phoneNormalized =
      phoneNormalized ||
      "";
  }

  if (
    wasProvided(
      req.data?.email
    )
  ) {
    const email =
      safeString(
        req.data?.email
      );

    const emailNormalized =
      normalizeEmail(
        email
      );

    /*
     * אם הוזן אימייל,
     * נוודא שהוא בפורמט בסיסי תקין.
     *
     * אימייל ריק מותר.
     */
    if (
      emailNormalized &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        emailNormalized
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid email address"
      );
    }

    updateData.email =
      email ||
      null;

    updateData.emailNormalized =
      emailNormalized ||
      null;
  }

  if (
    wasProvided(
      req.data?.idNumber
    )
  ) {
    updateData.idNumber =
      safeString(
        req.data?.idNumber
      ) ||
      null;
  }

  if (
    wasProvided(
      req.data?.birthDate
    )
  ) {
    updateData.birthDate =
      safeString(
        req.data?.birthDate
      ) ||
      null;
  }

  if (
    wasProvided(
      req.data?.gender
    )
  ) {
    updateData.gender =
      safeString(
        req.data?.gender
      ) ||
      null;
  }

  if (
    wasProvided(
      req.data?.consentStatus
    )
  ) {
    updateData.consentStatus =
      safeString(
        req.data?.consentStatus
      ) ||
      "unknown";
  }

  if (
    req.data?.tags !==
      undefined
  ) {
    const tags =
      Array.isArray(
        req.data?.tags
      )
        ? req.data.tags
            .map(
              (
                value: unknown
              ) =>
                safeString(
                  value
                )
            )
            .filter(Boolean)
        : [];

    updateData.tags =
      Array.from(
        new Set(
          tags
        )
      ).slice(
        0,
        50
      );
  }

  if (
    wasProvided(
      req.data?.contactStatus
    )
  ) {
    const contactStatus =
      safeString(
        req.data?.contactStatus
      ).toLowerCase();

    if (
      ![
        "active",
        "inactive",
      ].includes(
        contactStatus
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid contact status"
      );
    }

    updateData.contactStatus =
      contactStatus;

    if (
      contactStatus ===
        "inactive"
    ) {
      updateData.inactivatedAt =
        nowTs();

      updateData.inactivatedBy =
        authUid;
    } else {
      updateData.reactivatedAt =
        nowTs();

      updateData.reactivatedBy =
        authUid;
    }
  }

  await contactRef.set(
    updateData,
    {
      merge:
        true,
    }
  );

  const updatedSnap =
    await contactRef.get();

  const updated =
    updatedSnap.data() ||
    {};

  return {
    ok:
      true,

    agentId:
      requestedAgentId,

    contactId,

    fullName:
      safeString(
        updated?.fullName
      ),

    firstName:
      safeString(
        updated?.firstName
      ),

    lastName:
      safeString(
        updated?.lastName
      ),

    phone:
      safeString(
        updated?.phone
      ) ||
      "",

    phoneNormalized:
      safeString(
        updated
          ?.phoneNormalized
      ) ||
      "",

    email:
      safeString(
        updated?.email
      ) ||
      null,

    emailNormalized:
      safeString(
        updated
          ?.emailNormalized
      ) ||
      null,

    idNumber:
      safeString(
        updated?.idNumber
      ) ||
      null,

    birthDate:
      safeString(
        updated?.birthDate
      ) ||
      null,

    gender:
      safeString(
        updated?.gender
      ) ||
      null,

    consentStatus:
      safeString(
        updated
          ?.consentStatus
      ) ||
      "unknown",

    tags:
      Array.isArray(
        updated?.tags
      )
        ? updated.tags
        : [],

    contactStatus:
      safeString(
        updated
          ?.contactStatus
      ) ||
      "active",
  };
}
