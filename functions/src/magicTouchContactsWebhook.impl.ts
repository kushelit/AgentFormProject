/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

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

export async function magicTouchContactsWebhookImpl(
  req: any,
  res: any
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      error:
        "Method not allowed",
    });

    return;
  }

  const db =
    adminDb();

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
        "[magicTouchContactsWebhook] Authentication failed",
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
      "[magicTouchContactsWebhook] Unexpected authentication error",
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

  const surenseId =
    safeString(
      body?.surenseId
    );

  if (!surenseId) {
    res.status(400).json({
      ok: false,
      error:
        "Missing surenseId",
    });

    return;
  }

  const statusActiveRaw =
    body?.statusActive;

  const statusActive =
    typeof statusActiveRaw ===
    "boolean"
      ? statusActiveRaw
      : null;

  try {
    const result =
      await upsertMagicTouchContact(
        {
          agentId,

          sourceSystem:
            "surense",

          sourceRecordId:
            surenseId,

          fullName:
            safeString(
              body?.fullName
            ),

          phone:
            safeString(
              body?.phone
            ),

          email:
            safeString(
              body?.email
            ),

          idNumber:
            safeString(
              body?.idNumber
            ),

          gender:
            safeString(
              body?.gender
            ),

          birthDate:
            safeString(
              body?.birthDate
            ),

          sourceData: {
            customerId:
              surenseId,

            workflowId:
              safeString(
                body?.surenseWorkflowId
              ) || null,

            statusName:
              safeString(
                body?.statusName
              ) || null,

            statusActive,

            lastActivityDate:
              safeString(
                body?.lastActivityDate
              ) || null,
          },

          tags: [
            "surense",
          ],
        }
      );

    console.info(
      "[magicTouchContactsWebhook] Contact stored",
      {
        agentId,
        ...result,
      }
    );

    res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    console.error(
      "[magicTouchContactsWebhook] Contact upsert failed",
      {
        agentId,
        surenseId,

        error:
          error?.message ||
          String(error),
      }
    );

    res.status(500).json({
      ok: false,
      error:
        "Failed to save Magic Touch contact",
    });
  }
}