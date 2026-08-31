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

  const phone =
    safeString(
      req.data?.phone
    );

  const email =
    safeString(
      req.data?.email
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

  const phoneNormalized =
    normalizePhone(
      phone
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

  await contactRef.set(
    {
      /*
       * שומרים את הערך לתצוגה
       */
      phone:
        phone ||
        "",

      /*
       * ואת הערך שעליו MagicTouch
       * ו-WhatsApp יכולים לעבוד.
       */
      phoneNormalized:
        phoneNormalized ||
        "",

      email:
        email ||
        null,

      emailNormalized:
        emailNormalized ||
        null,

      updatedAt:
        nowTs(),

      updatedBy:
        authUid,
    },
    {
      merge:
        true,
    }
  );

  return {
    ok:
      true,

    agentId:
      requestedAgentId,

    contactId,

    phone:
      phone ||
      "",

    phoneNormalized:
      phoneNormalized ||
      "",

    email:
      email ||
      null,

    emailNormalized:
      emailNormalized ||
      null,
  };
}