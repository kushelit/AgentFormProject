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

const MAX_CUSTOMERS_PER_REQUEST = 100;

type ImportResultItem = {
  customerDocId: string;
  ok: boolean;
  contactId?: string;
  action?: "created" | "updated";
  error?: string;
};

function normalizeCustomerIds(
  value: any
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item: any) =>
          safeString(item)
        )
        .filter(Boolean)
    )
  );
}

export async function importMagicSaleCustomersToMagicTouchImpl(
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
   * בדיקת הרשאה מלאה בצד השרת:
   * - permissionOverrides.deny
   * - permissionOverrides.allow
   * - admin / role permissions
   * - subscription permissions עבור agent / manager
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
   * משתמש רגיל יכול לייבא רק לקוחות של הסוכן שלו.
   * Admin יכול לבחור סוכן אחר.
   */
  if (
    !isAdmin &&
    agentId !== userAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot import customers for another agent"
    );
  }

  const customerIds =
    normalizeCustomerIds(
      req.data?.customerIds
    );

  if (
    customerIds.length === 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing customerIds"
    );
  }

  if (
    customerIds.length >
    MAX_CUSTOMERS_PER_REQUEST
  ) {
    throw new HttpsError(
      "invalid-argument",
      `A maximum of ${MAX_CUSTOMERS_PER_REQUEST} customers is allowed per request`
    );
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  let notFound = 0;
  let wrongAgent = 0;

  const results:
    ImportResultItem[] = [];

  /*
   * שימוש ב-getAll מאפשר קריאה של כל המסמכים
   * המבוקשים בלי לבצע Query לפי מערך IDs.
   */
  const customerRefs =
    customerIds.map(
      (customerDocId) =>
        (db as any).doc(
          `customer/${customerDocId}`
        )
    );

  const customerSnaps =
    await (db as any).getAll(
      ...customerRefs
    );

  for (
    let index = 0;
    index < customerSnaps.length;
    index++
  ) {
    const customerSnap =
      customerSnaps[index];

    const requestedCustomerId =
      customerIds[index];

    if (!customerSnap.exists) {
      failed++;
      notFound++;

      results.push({
        customerDocId:
          requestedCustomerId,
        ok: false,
        error:
          "Customer document was not found",
      });

      continue;
    }

    const customer =
      customerSnap.data() as any;

    const customerAgentId =
      safeString(
        customer?.AgentId
      );

    if (
      !customerAgentId ||
      customerAgentId !== agentId
    ) {
      failed++;
      wrongAgent++;

      results.push({
        customerDocId:
          customerSnap.id,
        ok: false,
        error:
          "Customer does not belong to the selected agent",
      });

      continue;
    }

    const firstName =
      safeString(
        customer
          ?.firstNameCustomer
      );

    const lastName =
      safeString(
        customer
          ?.lastNameCustomer
      );

    const storedFullName =
      safeString(
        customer
          ?.fullNameCustomer
      );

    const fullName =
      storedFullName ||
      `${firstName} ${lastName}`.trim();

    try {
      const result =
        await upsertMagicTouchContact({
          agentId,

          sourceSystem:
            "magicsale",

          /*
           * מזהה מסמך customer הוא המזהה היציב.
           * אם נייבא שוב את אותו לקוח, אותו Contact יתעדכן.
           */
          sourceRecordId:
            customerSnap.id,

          fullName,
          firstName,
          lastName,

          phone:
            safeString(
              customer?.phone
            ),

          email:
            safeString(
              customer?.mail
            ),

          idNumber:
            safeString(
              customer
                ?.IDCustomer
            ),

          gender:
            safeString(
              customer?.gender
            ),

          birthDate:
            safeString(
              customer?.birthday
            ),

          tags: [
            "magicsale",
          ],

          sourceData: {
            customerDocId:
              customerSnap.id,

            customerId:
              safeString(
                customer
                  ?.IDCustomer
              ) ||
              null,

            parentId:
              safeString(
                customer
                  ?.parentID
              ) ||
              null,

            parentFullName:
              safeString(
                customer
                  ?.parentFullName
              ) ||
              null,

            address:
              safeString(
                customer?.address
              ) ||
              null,

            sourceLeadId:
              safeString(
                customer
                  ?.sourceValue ||
                customer
                  ?.sourceLead
              ) ||
              null,

            originalNotes:
              safeString(
                customer?.notes
              ) ||
              null,

            importedBy:
              authUid,
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

      results.push({
        customerDocId:
          customerSnap.id,
        ok: true,
        contactId:
          result.contactId,
        action:
          result.action,
      });
    } catch (error: any) {
      failed++;

      console.error(
        "[importMagicSaleCustomersToMagicTouch] Customer import failed",
        {
          authUid,
          agentId,
          customerDocId:
            customerSnap.id,
          error:
            error?.message ||
            String(error),
        }
      );

      results.push({
        customerDocId:
          customerSnap.id,
        ok: false,
        error:
          error?.message ||
          "Failed to import customer",
      });
    }
  }

  console.info(
    "[importMagicSaleCustomersToMagicTouch] Import completed",
    {
      authUid,
      agentId,
      received:
        customerIds.length,
      created,
      updated,
      failed,
      notFound,
      wrongAgent,
    }
  );

  return {
    ok:
      failed === 0,

    partialSuccess:
      failed > 0 &&
      created + updated > 0,

    agentId,

    received:
      customerIds.length,

    created,
    updated,
    failed,
    notFound,
    wrongAgent,

    results,
  };
}