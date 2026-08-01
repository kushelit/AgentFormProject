/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";

import { adminDb } from "./shared/admin";
import { safeString } from "./shared/magicTouchContacts";
import { upsertMagicTouchContact } from "./shared/magicTouchContactService";
import {
  requireBackendPermission,
} from "./shared/backendPermissions";

const MAX_ROWS_PER_REQUEST = 100;

type ExcelContactRow = {
  rowNumber?: unknown;

  fullName?: unknown;
  firstName?: unknown;
  lastName?: unknown;

  phone?: unknown;
  email?: unknown;

  idNumber?: unknown;
  gender?: unknown;
  birthDate?: unknown;

  notes?: unknown;
  tags?: unknown;

  sourceData?: unknown;
};

type ImportResultItem = {
  index: number;
  rowNumber: number;
  ok: boolean;

  contactId?: string;
  action?: "created" | "updated";

  error?: string;
};

function normalizeTags(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) =>
          safeString(item)
        )
        .filter(Boolean)
    )
  );
}

function normalizeRows(
  value: unknown
): ExcelContactRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (row) =>
      row !== null &&
      typeof row === "object"
  );
}

function normalizeRowNumber(
  value: unknown,
  fallback: number
): number {
  const parsed =
    Number(value);

  if (
    Number.isFinite(parsed) &&
    parsed > 0
  ) {
    return Math.floor(parsed);
  }

  return fallback;
}

export async function importMagicTouchExcelContactsImpl(
  req: any
): Promise<object> {
  const authUid =
    safeString(req.auth?.uid);

  if (!authUid) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const db =
    adminDb();

  const userSnap = await (db as any)
    .collection("users")
    .doc(authUid)
    .get();

  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() as any;

  /*
   * הרשאת Magic Touch יכולה להגיע ממסלול מנוי,
   * הרשאה ידנית, role או admin.
   */
  await requireBackendPermission({
    db: db as any,
    userId: authUid,
    userData,
    permission: "access_magic_touch",
  });

  const isAdmin =
    userData?.role === "admin" ||
    userData?.isSystem === true;

  const userAgentId =
    safeString(
      userData?.agentId
    ) ||
    authUid;

  const requestedAgentId =
    safeString(
      req.data?.agentId
    );

  const agentId =
    requestedAgentId ||
    userAgentId;

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  /*
   * משתמש רגיל מייבא רק לסוכן שלו.
   * Admin יכול לבחור סוכן אחר.
   */
  if (
    !isAdmin &&
    agentId !== userAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot import contacts for another agent"
    );
  }

  const importId =
    safeString(
      req.data?.importId
    );

  const fileName =
    safeString(
      req.data?.fileName
    );

  if (!importId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing importId"
    );
  }

  if (!fileName) {
    throw new HttpsError(
      "invalid-argument",
      "Missing fileName"
    );
  }

  const rows =
    normalizeRows(
      req.data?.rows
    );

  if (rows.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "Missing rows"
    );
  }

  if (
    rows.length >
    MAX_ROWS_PER_REQUEST
  ) {
    throw new HttpsError(
      "invalid-argument",
      `A maximum of ${MAX_ROWS_PER_REQUEST} rows is allowed per request`
    );
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  const results:
    ImportResultItem[] = [];

  for (
    let index = 0;
    index < rows.length;
    index++
  ) {
    const row =
      rows[index] || {};

    const rowNumber =
      normalizeRowNumber(
        row.rowNumber,
        index + 2
      );

    const fullName =
      safeString(
        row.fullName
      );

    const firstName =
      safeString(
        row.firstName
      );

    const lastName =
      safeString(
        row.lastName
      );

    const phone =
      safeString(
        row.phone
      );

    const email =
      safeString(
        row.email
      );

    const idNumber =
      safeString(
        row.idNumber
      );

    const gender =
      safeString(
        row.gender
      );

    const birthDate =
      safeString(
        row.birthDate
      );

    const notes =
      safeString(
        row.notes
      );

    if (
      !fullName &&
      !firstName &&
      !lastName
    ) {
      failed++;

      results.push({
        index,
        rowNumber,
        ok: false,
        error:
          "Missing contact name",
      });

      continue;
    }

    if (
      !phone &&
      !email
    ) {
      failed++;

      results.push({
        index,
        rowNumber,
        ok: false,
        error:
          "A phone number or email address is required",
      });

      continue;
    }

    /*
     * אותו importId ואותה שורה תמיד יוצרים אותו מזהה.
     * לחיצה חוזרת על אותו ייבוא תעדכן ולא תשכפל.
     */
    const sourceRecordId =
      `${importId}_${rowNumber}`;

    try {
      const result =
        await upsertMagicTouchContact({
          agentId,

          sourceSystem:
            "excel",

          sourceRecordId,

          fullName,
          firstName,
          lastName,

          phone,
          email,

          idNumber,
          gender,
          birthDate,

          tags: [
            "excel",
            ...normalizeTags(
              row.tags
            ),
          ],

          sourceData: {
            importId,
            fileName,
            rowNumber,
            uploadedBy:
              authUid,

            custom:
              row.sourceData &&
              typeof row.sourceData ===
                "object"
                ? row.sourceData
                : {},
          },
        });

      if (
        result.action ===
        "created"
      ) {
        created++;
      } else {
        updated++;
      }

      /*
       * notes הוא מידע פנימי של Magic Touch,
       * לכן נשמר בשדה הראשי ולא בתוך sourceData.
       */
      if (notes) {
        await (db as any)
          .doc(
            `agents/${agentId}/magic_touch_contacts/${result.contactId}`
          )
          .set(
            {
              notes,
            },
            {
              merge: true,
            }
          );
      }

      results.push({
        index,
        rowNumber,
        ok: true,
        contactId:
          result.contactId,
        action:
          result.action,
      });
    } catch (error: any) {
      failed++;

      console.error(
        "[importMagicTouchExcelContacts] Row import failed",
        {
          authUid,
          agentId,
          importId,
          fileName,
          index,
          rowNumber,
          error:
            error?.message ||
            String(error),
        }
      );

      results.push({
        index,
        rowNumber,
        ok: false,
        error:
          error?.message ||
          "Failed to import row",
      });
    }
  }

  console.info(
    "[importMagicTouchExcelContacts] Import completed",
    {
      authUid,
      agentId,
      importId,
      fileName,
      received:
        rows.length,
      created,
      updated,
      failed,
    }
  );

  return {
    ok:
      failed === 0,

    partialSuccess:
      failed > 0 &&
      created + updated > 0,

    agentId,
    importId,
    fileName,

    received:
      rows.length,

    created,
    updated,
    failed,

    results,
  };
}