/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  adminDb,
} from "./shared/admin";

type Provider =
  | "make"
  | "api";

type ActionKey =
  | "searchCustomers"
  | "createWorkflow"
  | "updateWorkflow"
  | "closeWorkflow"
  | "getCustomer"
  | "createPowerOfAttorney";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizeProvider(
  value: any
): Provider {
  return value === "api"
    ? "api"
    : "make";
}

function normalizeAction(
  value: any
) {
  return {
    enabled:
      typeof value?.enabled ===
      "boolean"
        ? value.enabled
        : true,

    provider:
      normalizeProvider(
        value?.provider
      ),
  };
}

export async function saveSurenseSystemConfigImpl(
  input: {
    config: any;
    updatedBy: string;
  }
): Promise<object> {
  const updatedBy =
    s(
      input?.updatedBy
    );

  if (!updatedBy) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const db =
    adminDb();

  const userSnap =
    await (
      db as any
    )
      .doc(
        `users/${updatedBy}`
      )
      .get();

  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() as any;

  if (
    userData?.isSystem !==
    true
  ) {
    throw new HttpsError(
      "permission-denied",
      "System access required"
    );
  }

  const incoming =
    input?.config ||
    {};

  const actionKeys:
    ActionKey[] = [
      "searchCustomers",
      "createWorkflow",
      "updateWorkflow",
      "closeWorkflow",
      "getCustomer",
      "createPowerOfAttorney",
    ];

  const actions =
    actionKeys.reduce(
      (
        result:
          Record<string, any>,
        key
      ) => {
        result[key] =
          normalizeAction(
            incoming
              ?.actions
              ?.[key]
          );

        return result;
      },
      {}
    );

  const timestamp =
    FieldValue
      .serverTimestamp();

  await (
    db as any
  )
    .doc(
      "systemConfig/surenseIntegration"
    )
    .set(
      {
        actions,

        updatedAt:
          timestamp,

        updatedBy,
      },
      {
        merge: true,
      }
    );

  return {
    ok: true,

    config: {
      actions,
      updatedAt:
        timestamp,
      updatedBy,
    },
  };
}