/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { randomUUID } from "node:crypto";

import {
  adminDb,
} from "./shared/admin";

import {
  validateWebhookAgent,
  WebhookAuthError,
} from "./shared/validateWebhookAgent";

import {
  safeString,
} from "./shared/magicTouchContacts";

import {
  upsertMagicTouchContact,
} from "./shared/magicTouchContactService";

const MAX_CONTACTS_PER_REQUEST = 100;

type IncomingContact = {
  sourceRecordId?: unknown;

  fullName?: unknown;
  firstName?: unknown;
  lastName?: unknown;

  phone?: unknown;
  email?: unknown;

  idNumber?: unknown;
  gender?: unknown;
  birthDate?: unknown;

  tags?: unknown;
  sourceData?: unknown;
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

function getIncomingContacts(
  body: any
): IncomingContact[] {
  if (Array.isArray(body?.contacts)) {
    return body.contacts;
  }

  if (
    body?.contact &&
    typeof body.contact === "object"
  ) {
    return [
      body.contact,
    ];
  }

  return [];
}

export async function magicTouchContactsApiImpl(
  req: any,
  res: any
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });

    return;
  }

  const body =
    req.body as any;

  const agentId =
    safeString(
      body?.agentId
    );

  const incomingKey =
    safeString(
      req.headers["x-api-key"]
    );

  const db =
    adminDb();

  try {
    await validateWebhookAgent({
      db: db as any,
      agentId,
      incomingKey,
    });
  } catch (error: any) {
    if (
      error instanceof
      WebhookAuthError
    ) {
      console.warn(
        "[magicTouchContactsApi] Authentication failed",
        {
          agentId,
          error:
            error.message,
        }
      );

      res
        .status(error.status)
        .json({
          ok: false,
          error:
            error.message,
        });

      return;
    }

    console.error(
      "[magicTouchContactsApi] Unexpected authentication error",
      {
        agentId,
        error:
          error?.message ||
          String(error),
      }
    );

    res.status(500).json({
      ok: false,
      error:
        "Internal authentication error",
    });

    return;
  }

  /*
   * לכל חיבור CRM יהיה integrationId יציב.
   * לדוגמה:
   * salesforce_main
   * routeo
   * agency_crm_1
   */
  const integrationId =
    safeString(
      body?.integrationId
    );

  if (!integrationId) {
    res.status(400).json({
      ok: false,
      error:
        "Missing integrationId",
    });

    return;
  }

  const integrationName =
    safeString(
      body?.integrationName
    ) ||
    integrationId;

  const contacts =
    getIncomingContacts(body);

  if (contacts.length === 0) {
    res.status(400).json({
      ok: false,
      error:
        "Missing contact or contacts",
    });

    return;
  }

  if (
    contacts.length >
    MAX_CONTACTS_PER_REQUEST
  ) {
    res.status(400).json({
      ok: false,
      error:
        `A maximum of ${MAX_CONTACTS_PER_REQUEST} contacts is allowed per request`,
    });

    return;
  }

  const requestId =
    safeString(
      body?.requestId
    ) ||
    randomUUID();

  let created = 0;
  let updated = 0;
  let failed = 0;

  const results: any[] = [];

  /*
   * מבצעים את הקליטה בצורה סדרתית כדי לא ליצור
   * עומס בלתי מבוקר על Firestore ועל Transactions.
   */
  for (
    let index = 0;
    index < contacts.length;
    index++
  ) {
    const contact =
      contacts[index] || {};

    const sourceRecordId =
      safeString(
        contact.sourceRecordId
      );

    const phone =
      safeString(
        contact.phone
      );

    const email =
      safeString(
        contact.email
      );

    if (!sourceRecordId) {
      failed++;

      results.push({
        index,
        ok: false,
        error:
          "Missing sourceRecordId",
      });

      continue;
    }

    if (!phone && !email) {
      failed++;

      results.push({
        index,
        sourceRecordId,
        ok: false,
        error:
          "A phone number or email address is required",
      });

      continue;
    }

    try {
      const result =
        await upsertMagicTouchContact({
          agentId,

          sourceSystem:
            "external_crm",

          sourceRecordId,

          /*
           * מונע התנגשות אם שתי מערכות CRM שונות
           * משתמשות באותו sourceRecordId.
           */
          sourceIdentity:
            `${integrationId}:${sourceRecordId}`,

          fullName:
            safeString(
              contact.fullName
            ),

          firstName:
            safeString(
              contact.firstName
            ),

          lastName:
            safeString(
              contact.lastName
            ),

          phone,

          email,

          idNumber:
            safeString(
              contact.idNumber
            ),

          gender:
            safeString(
              contact.gender
            ),

          birthDate:
            safeString(
              contact.birthDate
            ),

          tags: [
            "external_crm",
            integrationId,
            ...normalizeTags(
              contact.tags
            ),
          ],

          sourceData: {
            integrationId,
            integrationName,

            originalSourceRecordId:
              sourceRecordId,

            requestId,

            custom:
              contact.sourceData &&
              typeof contact.sourceData ===
                "object"
                ? contact.sourceData
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

      results.push({
        index,
        ok: true,
        ...result,
      });
    } catch (error: any) {
      failed++;

      console.error(
        "[magicTouchContactsApi] Contact import failed",
        {
          agentId,
          integrationId,
          sourceRecordId,
          index,

          error:
            error?.message ||
            String(error),
        }
      );

      results.push({
        index,
        sourceRecordId,
        ok: false,
        error:
          error?.message ||
          "Failed to import contact",
      });
    }
  }

  console.info(
    "[magicTouchContactsApi] Request completed",
    {
      agentId,
      integrationId,
      requestId,
      received:
        contacts.length,
      created,
      updated,
      failed,
    }
  );

  res.status(200).json({
    ok:
      failed === 0,

    partialSuccess:
      failed > 0 &&
      created + updated > 0,

    agentId,
    integrationId,
    requestId,

    received:
      contacts.length,

    created,
    updated,
    failed,

    results,
  });
}