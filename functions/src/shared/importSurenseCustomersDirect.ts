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
  createSurenseWorkflow,
} from "./createSurenseWorkflow";

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
   * אם Direct API מחזיר לקוח יחיד,
   * מאפשרים גם את המצב הזה.
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

function oneYearAgoIso(): string {
  const date =
    new Date();

  date.setUTCFullYear(
    date.getUTCFullYear() -
      1
  );

  return date.toISOString();
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

  const cutoff =
    oneYearAgoIso();

  /*
   * משחזרים את הלוגיקה של Make:
   *
   * lastModifiedDate <= לפני שנה
   *
   * והמיון לפי lastActivityDate עולה.
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

      sorts: [
        {
          dir:
            "asc",

          field:
            "lastActivityDate",
        },
      ],

      filtersOperator:
        "and",

      filters: [
        {
          field:
            "lastModifiedDate",

          operator:
            "lessThanOrEqual",

          value:
            cutoff,
        },
      ],
    });

  const customers =
    extractCustomers(
      searchResult.response
    );

  console.info(
    "[importSurenseCustomersDirect] Search completed",
    {
      agentId,
      cutoff,
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
     * קודם פותחים Workflow ב-Surense.
     *
     * זה גם מעדכן את הפעילות של הלקוח
     * וכך מונע ממנו להיכנס שוב
     * בסבב הבא.
     */
    const workflowResult =
      await createSurenseWorkflow({
        agentId,
        customerId,
      });

    /*
     * רק אחרי ש-Workflow נוצר בהצלחה,
     * מכניסים/מעדכנים את הלקוח ב-MagicTouch.
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

          workflowId:
            workflowResult
              .workflowId,

          statusName:
            statusName ||
            null,

          statusActive,

          lastActivityDate:
            workflowResult
              .lastActivityDate ||
            lastActivityDate ||
            null,
        },

        tags: [
          "surense",
        ],
      });

    results.push({
      customerId,

      workflowId:
        workflowResult
          .workflowId,

      contactResult,
    });
  }

  return {
    ok: true,

    provider:
      "api",

    cutoff,

    searched:
      customers.length,

    imported:
      results.length,

    results,
  };
}