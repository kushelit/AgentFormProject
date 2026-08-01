/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";

function s(value: any): string {
  return String(value ?? "").trim();
}

function stringArray(value: any): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item: any) => s(item))
    .filter(Boolean);
}

export type BackendPermissionContext = {
  userId: string;
  userData: any;
  rolePermissions: string[];
  subscriptionPermissions: string[];
};

export async function getBackendPermissionContext(
  db: any,
  userId: string,
  suppliedUserData?: any
): Promise<BackendPermissionContext> {
  const normalizedUserId = s(userId);

  if (!normalizedUserId) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  let userData = suppliedUserData;

  if (!userData) {
    const userSnap = await db
      .collection("users")
      .doc(normalizedUserId)
      .get();

    if (!userSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "User not found"
      );
    }

    userData = userSnap.data() as any;
  }

  const role = s(userData?.role);
  const subscriptionType =
    s(userData?.subscriptionType);

  let rolePermissions: string[] = [];
  let subscriptionPermissions: string[] = [];

  /*
   * Agent ו-Manager עובדים לפי מסלול המנוי,
   * בדיוק כמו usePermission בצד ה-Frontend.
   */
  if (
    role === "agent" ||
    role === "manager"
  ) {
    if (subscriptionType) {
      const subscriptionSnap = await db
        .collection("subscriptions_permissions")
        .doc(subscriptionType)
        .get();

      if (subscriptionSnap.exists) {
        subscriptionPermissions =
          stringArray(
            subscriptionSnap.data()?.permissions
          );
      }
    }
  } else if (role) {
    /*
     * Worker ותפקידים אחרים עובדים לפי roles.
     */
    const roleSnap = await db
      .collection("roles")
      .doc(role)
      .get();

    if (roleSnap.exists) {
      rolePermissions =
        stringArray(
          roleSnap.data()?.permissions
        );
    }
  }

  return {
    userId: normalizedUserId,
    userData,
    rolePermissions,
    subscriptionPermissions,
  };
}

export function hasBackendPermission(
  context: BackendPermissionContext,
  permission: string
): boolean {
  const normalizedPermission =
    s(permission);

  if (!normalizedPermission) {
    return false;
  }

  const {
    userData,
    rolePermissions,
    subscriptionPermissions,
  } = context;

  const deny =
    stringArray(
      userData
        ?.permissionOverrides
        ?.deny
    );

  /*
   * זהה ל-hasPermission:
   * deny ידני קודם לכל מקור אחר.
   */
  if (
    deny.includes(
      normalizedPermission
    )
  ) {
    return false;
  }

  const allow =
    stringArray(
      userData
        ?.permissionOverrides
        ?.allow
    );

  /*
   * הרשאה ידנית מאפשרת גישה גם אם היא לא במסלול.
   */
  if (
    allow.includes(
      normalizedPermission
    )
  ) {
    return true;
  }

  const role =
    s(userData?.role);

  if (
    role === "admin" ||
    rolePermissions.includes("*")
  ) {
    return true;
  }

  /*
   * Agent / Manager — לפי מסלול.
   */
  if (
    role === "agent" ||
    role === "manager"
  ) {
    return subscriptionPermissions.includes(
      normalizedPermission
    );
  }

  /*
   * Worker ושאר התפקידים — לפי role.
   */
  return rolePermissions.includes(
    normalizedPermission
  );
}

export async function requireBackendPermission({
  db,
  userId,
  permission,
  userData,
}: {
  db: any;
  userId: string;
  permission: string;
  userData?: any;
}): Promise<BackendPermissionContext> {
  const context =
    await getBackendPermissionContext(
      db,
      userId,
      userData
    );

  if (
    !hasBackendPermission(
      context,
      permission
    )
  ) {
    throw new HttpsError(
      "permission-denied",
      `Missing permission: ${permission}`
    );
  }

  return context;
}