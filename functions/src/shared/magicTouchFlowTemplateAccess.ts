/* eslint-disable require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb } from "./admin";
import { safeString } from "./magicTouchContacts";
import { requireBackendPermission } from "./backendPermissions";

export const FLOW_TEMPLATE_MANAGE_PERMISSION =
  "access_magic_touch_jobs_admin";

export async function resolveMagicTouchFlowTemplateAccess(req: any) {
  const authUid = safeString(req.auth?.uid);

  if (!authUid) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const db = adminDb();
  const userSnap = await (db as any)
    .collection("users")
    .doc(authUid)
    .get();

  if (!userSnap.exists) {
    throw new HttpsError("permission-denied", "User not found");
  }

  const userData = userSnap.data() as any;

  if (userData?.isSystem !== true) {
    throw new HttpsError(
      "permission-denied",
      "Flow template library is restricted to system administrators"
    );
  }

  await requireBackendPermission({
    db: db as any,
    userId: authUid,
    userData,
    permission: FLOW_TEMPLATE_MANAGE_PERMISSION,
  });

  return { db, authUid, userData };
}
