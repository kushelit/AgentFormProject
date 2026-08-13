/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
} from "./shared/admin";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function getSurenseSystemConfigImpl(
  input: {
    requestedBy: string;
  }
): Promise<object> {
  const requestedBy =
    s(
      input?.requestedBy
    );

  if (!requestedBy) {
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
        `users/${requestedBy}`
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

  const snap =
    await (
      db as any
    )
      .doc(
        "systemConfig/surenseIntegration"
      )
      .get();

  const data =
    snap.exists
      ? snap.data()
      : {};

  return {
    ok: true,

    config: {
      actions:
        data?.actions || {},
      updatedAt:
        data?.updatedAt ||
        null,
      updatedBy:
        s(
          data?.updatedBy
        ) ||
        null,
    },
  };
}