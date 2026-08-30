/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from "node:crypto";

export type MagicTouchSourceSystem =
  | "surense"
  | "magicsale"
  | "excel"
  | "manual"
  | "external_crm"
  | "other";

export type MagicTouchContactStatus =
  | "active"
  | "closed"
  | "blocked";

export type MagicTouchInterestStatus =
  | "unknown"
  | "pending"
  | "interested"
  | "not_interested"
  | "no_response";

export type MagicTouchAppointmentStatus =
  | "not_required"
  | "not_sent"
  | "link_sent"
  | "booked"
  | "cancelled"
  | "no_booking";

export type MagicTouchConsentStatus =
  | "unknown"
  | "granted"
  | "revoked";

export function safeString(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

/**
 * פורמט פנימי אחיד לטלפונים.
 *
 * משמש לזיהוי שיחות,
 * WhatsApp והשוואה בין מספרים.
 *
 * לדוגמה:
 * 0529289133
 * +972529289133
 *
 * שניהם יהפכו ל:
 * 972529289133
 */
export function normalizeMagicTouchPhone(
  value: any
): string {
  const digits =
    safeString(value)
      .replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (
    digits.startsWith("972") &&
    digits.length === 12
  ) {
    return digits;
  }

  if (
    digits.startsWith("0") &&
    digits.length === 10
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

/**
 * פורמט קריא להצגה בישראל.
 *
 * לדוגמה:
 * +972529289133
 * 972529289133
 * 529289133
 *
 * יהפכו ל:
 * 0529289133
 *
 * הפונקציה אינה מיועדת לזיהוי/WhatsApp.
 * לצרכים אלה יש להשתמש
 * ב-normalizeMagicTouchPhone.
 */
export function formatMagicTouchPhoneForDisplay(
  value: any
): string {
  const digits =
    safeString(value)
      .replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  /*
   * +97252...
   * או
   * 97252...
   *
   * ↓
   *
   * 052...
   */
  if (
    digits.startsWith("972") &&
    digits.length === 12
  ) {
    return `0${digits.slice(3)}`;
  }

  /*
   * מספר ישראלי שכבר הגיע
   * בפורמט 05XXXXXXXX.
   */
  if (
    digits.startsWith("0") &&
    digits.length === 10
  ) {
    return digits;
  }

  /*
   * מספר ישראלי ללא 0 מוביל.
   */
  if (
    digits.length === 9
  ) {
    return `0${digits}`;
  }

  /*
   * אם המבנה לא מוכר,
   * לא משנים אותו בצורה שעלולה
   * להשחית מספר בינלאומי.
   */
  return safeString(value);
}

export function normalizeMagicTouchEmail(
  value: any
): string {
  return safeString(
    value
  ).toLowerCase();
}

/**
 * יוצר מזהה קבוע ובטוח עבור איש קשר
 * שמגיע ממערכת חיצונית.
 *
 * אנחנו לא משתמשים ישירות
 * ב-sourceRecordId בתוך נתיב Firestore,
 * כדי למנוע בעיות אם בעתיד המזהה
 * יכיל /, רווחים או תווים מיוחדים.
 */
export function createMagicTouchContactId(
  sourceSystem:
    MagicTouchSourceSystem,
  sourceRecordId:
    string
): string {
  const normalizedSourceSystem =
    safeString(
      sourceSystem
    ).toLowerCase();

  const normalizedSourceRecordId =
    safeString(
      sourceRecordId
    );

  if (
    !normalizedSourceSystem ||
    !normalizedSourceRecordId
  ) {
    throw new Error(
      "Missing sourceSystem or sourceRecordId"
    );
  }

  const hash =
    createHash(
      "sha256"
    )
      .update(
        `${normalizedSourceSystem}:${normalizedSourceRecordId}`
      )
      .digest("hex")
      .slice(0, 32);

  return `${normalizedSourceSystem}_${hash}`;
}

export function splitFullName(
  fullName: string
): {
  firstName: string;
  lastName: string;
} {
  const parts =
    safeString(
      fullName
    )
      .split(/\s+/)
      .filter(Boolean);

  if (
    parts.length === 0
  ) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  if (
    parts.length === 1
  ) {
    return {
      firstName:
        parts[0],

      lastName:
        "",
    };
  }

  return {
    firstName:
      parts[0],

    lastName:
      parts
        .slice(1)
        .join(" "),
  };
}