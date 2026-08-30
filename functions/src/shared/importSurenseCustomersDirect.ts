/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  searchSurenseCustomers,
} from "./searchSurenseCustomers";

import {
  upsertMagicTouchContact,
} from "./magicTouchContactService";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function first(
  source: any,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (
      source &&
      source[key] !== undefined &&
      source[key] !== null
    ) {
      return source[key];
    }
  }

  return undefined;
}

function extractCustomers(
  response: any
): any[] {
  if (Array.isArray(response)) {
    return response;
  }

  const candidates = [
    response?.rows,
    response?.data,
    response?.items,
    response?.results,
    response?.content,
    response?.customers,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  /*
   * מאפשרים גם מצב שבו
   * Surense מחזיר אובייקט לקוח יחיד.
   */
  if (
    response &&
    typeof response === "object"
  ) {
    const id =
      first(
        response,
        "id",
        "ID"
      );

    if (id) {
      return [
        response,
      ];
    }
  }

  return [];
}

export async function importSurenseCustomersDirect(
  input: {
    agentId: string;

    startRow?: number;
    endRow?: number;
  }
) {
  const agentId =
    s(
      input.agentId
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  /*
   * פעולה זו אחראית רק על:
   *
   * 1. Search Customers ב-Surense
   * 2. יצירה/עדכון Contact ב-MagicTouch
   *
   * היא אינה יוצרת Workflow ב-Surense.
   *
   * Create Workflow הוא capability עצמאי
   * ויכול להתבצע לאחר מכן לפי ה-Flow
   * העסקי של הסוכן.
   */
  const searchResult =
    await searchSurenseCustomers({
      agentId,

      startRow:
        input.startRow ??
        0,

      endRow:
        input.endRow ??
        50,

      filtersOperator:
        "and",
    });

  const customers =
    extractCustomers(
      searchResult.response
    );

  console.info(
    "[importSurenseCustomersDirect] Search completed",
    {
      agentId,

      count:
        customers.length,
    }
  );

  const results:
    Array<Record<string, unknown>> = [];

  for (
    const customer of customers
  ) {
    const customerId =
      s(
        first(
          customer,
          "id",
          "ID"
        )
      );

    if (!customerId) {
      console.warn(
        "[importSurenseCustomersDirect] Customer skipped - missing ID",
        {
          agentId,
        }
      );

      continue;
    }

    const fullName =
      s(
        first(
          customer,
          "fullName",
          "Full Name",
          "name"
        )
      );

    const phone =
      s(
        first(
          customer,
          "cellNumber",
          "Cell Number",
          "phone"
        )
      );

    const email =
      s(
        first(
          customer,
          "email",
          "Email"
        )
      );

    const idNumber =
      s(
        first(
          customer,
          "idNumber",
          "ID Number"
        )
      );

    const birthDate =
      s(
        first(
          customer,
          "birthDate",
          "Birth Date"
        )
      );

    const statusName =
      s(
        first(
          customer,
          "statusName",
          "Status Name"
        )
      );

    const statusActiveRaw =
      first(
        customer,
        "statusActive",
        "Status Active"
      );

    const statusActive =
      typeof statusActiveRaw ===
        "boolean"
        ? statusActiveRaw
        : null;

    const lastActivityDate =
      s(
        first(
          customer,
          "lastActivityDate",
          "Last Activity Date"
        )
      );

    /*
     * Upsert קבוע:
     *
     * אם הלקוח לא קיים ב-MagicTouch
     * הוא ייווצר.
     *
     * אם הוא כבר קיים לפי Surense Customer ID
     * אותו Contact יעודכן בנתונים החדשים.
     */
    const contactResult =
      await upsertMagicTouchContact({
        agentId,

        sourceSystem:
          "surense",

        sourceRecordId:
          customerId,

        fullName,
        phone,
        email,
        idNumber,
        birthDate,

        sourceData: {
          customerId,

          statusName:
            statusName ||
            null,

          statusActive,

          lastActivityDate:
            lastActivityDate ||
            null,
        },

        tags: [
          "surense",
        ],
      });

    results.push({
      customerId,

      contactId:
        contactResult
          .contactId,

      action:
        contactResult
          .action,

      contactResult,
    });
  }

  return {
    ok: true,

    provider:
      "api",

    searched:
      customers.length,

    imported:
      results.length,

    results,
  };
}