/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  executeSurenseDirectRequest,
} from "./surenseDirectClient";

export type SurenseSearchSort = {
  dir:
    | "asc"
    | "desc";

  field: string;
};

export type SurenseSearchFilter = {
  field: string;
  operator: string;
  value: unknown;
};

export type SearchSurenseCustomersInput = {
  agentId: string;

  startRow?: number;
  endRow?: number;

  sorts?:
    SurenseSearchSort[];

  filtersOperator?:
    | "and"
    | "or";

  filters?:
    SurenseSearchFilter[];
};

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function safeRow(
  value: unknown,
  fallback: number
): number {
  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed < 0
  ) {
    return fallback;
  }

  return Math.floor(
    parsed
  );
}

export async function searchSurenseCustomers(
  input:
    SearchSurenseCustomersInput
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

  const startRow =
    safeRow(
      input.startRow,
      0
    );

  const endRow =
    safeRow(
      input.endRow,
      50
    );

  if (
    endRow <=
    startRow
  ) {
    throw new HttpsError(
      "invalid-argument",
      "endRow must be greater than startRow"
    );
  }

  /*
   * כרגע לא מגבילים ל-2.
   * ה-2 שהיה ב-Make היה רק לטסטים.
   *
   * Pagination תישלט ע"י הקורא.
   */
  const body = {
    startRow,
    endRow,

    sorts:
      input.sorts &&
      input.sorts.length
        ? input.sorts
        : [
            {
              dir:
                "desc",

              field:
                "createdDate",
            },
          ],

    filtersOperator:
      input.filtersOperator ||
      "and",

    filters:
      input.filters ||
      [],
  };

  return executeSurenseDirectRequest({
    agentId,

    path:
      "/customers/search",

    method:
      "POST",

    scopes: [
      "customers:read",
    ],

    body,
  });
}