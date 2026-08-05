/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
} from "../admin";

export const JOBS_ADMIN_PERMISSION =
  "access_magic_touch_jobs_admin";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function stringArray(
  value: unknown
): string[] {
  return Array.isArray(value)
    ? value
      .map(s)
      .filter(Boolean)
    : [];
}

export async function assertMagicTouchJobsAdmin(
  uid: string | null
): Promise<void> {
  if (!uid) {
    throw new HttpsError(
      "unauthenticated",
      "A signed-in user is required"
    );
  }

  const db =
    adminDb();

  const userSnap =
    await db
      .doc(
        `users/${uid}`
      )
      .get();

  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User profile was not found"
    );
  }

  const user =
    userSnap.data() as any;

  const role =
    s(user?.role);

  const allow =
    new Set<string>([
      ...stringArray(
        user
          ?.permissionOverrides
          ?.allow
      ),
      ...stringArray(
        user?.permissions
      ),
    ]);

  const deny =
    new Set<string>(
      stringArray(
        user
          ?.permissionOverrides
          ?.deny
      )
    );

  const allowed =
    !deny.has(
      JOBS_ADMIN_PERMISSION
    ) &&
    (
      allow.has(
        JOBS_ADMIN_PERMISSION
      ) ||
      role ===
        "admin"
    );

  if (!allowed) {
    throw new HttpsError(
      "permission-denied",
      `Missing permission: ${JOBS_ADMIN_PERMISSION}`
    );
  }
}
