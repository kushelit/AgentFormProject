/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";

import { adminDb, nowTs } from "./shared/admin";
import { safeString } from "./shared/magicTouchContacts";
import { requireBackendPermission } from "./shared/backendPermissions";

import {
  loadMagicTouchWhatsAppTemplateContext,
  sendMagicTouchTemplateToContact,
} from "./shared/sendMagicTouchWhatsAppTemplateService";

const MAX_CONTACTS_PER_CAMPAIGN =
  100;

type CampaignResultItem = {
  contactId: string;
  ok: boolean;

  waMessageId?: string;
  conversationId?: string;

  error?: string;
};

function normalizeContactIds(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(
          (
            contactId
          ) =>
            safeString(
              contactId
            )
        )
        .filter(Boolean)
    )
  );
}

export async function sendMagicTouchWhatsAppCampaignImpl(
  req: any
): Promise<object> {
  const authUid =
    safeString(
      req.auth?.uid
    );

  if (!authUid) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const requestedAgentId =
    safeString(
      req.data?.agentId
    );

  const templateName =
    safeString(
      req.data?.templateName
    );

  const campaignName =
    safeString(
      req.data?.campaignName
    );

  const contactIds =
    normalizeContactIds(
      req.data?.contactIds
    );

  if (!templateName) {
    throw new HttpsError(
      "invalid-argument",
      "Missing templateName"
    );
  }

  if (
    contactIds.length ===
    0
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing contactIds"
    );
  }

  if (
    contactIds.length >
    MAX_CONTACTS_PER_CAMPAIGN
  ) {
    throw new HttpsError(
      "invalid-argument",
      `A maximum of ${MAX_CONTACTS_PER_CAMPAIGN} contacts is allowed per campaign`
    );
  }

  const db =
    adminDb();

  const userSnap =
    await (db as any)
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

  await requireBackendPermission({
    db: db as any,
    userId:
      authUid,
    userData,
    permission:
      "access_magic_touch",
  });

  const isAdmin =
    userData?.role ===
      "admin" ||
    userData?.isSystem ===
      true;

  const userAgentId =
    safeString(
      userData?.agentId
    ) ||
    authUid;

  const agentId =
    requestedAgentId ||
    userAgentId;

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (
    !isAdmin &&
    agentId !== userAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot send a campaign for another agent"
    );
  }

  const campaignRef =
    (db as any)
      .collection(
        `agents/${agentId}/magic_touch_campaigns`
      )
      .doc();

  const campaignId =
    campaignRef.id;

  const finalCampaignName =
    campaignName ||
    `קמפיין WhatsApp ${new Date().toLocaleDateString("he-IL")}`;

  await campaignRef.set({
    campaignId,
    agentId,

    name:
      finalCampaignName,

    channel:
      "whatsapp",

    templateName,

    status:
      "processing",

    totalContacts:
      contactIds.length,

    sentCount:
      0,

    failedCount:
      0,

    createdBy:
      authUid,

    createdByName:
      safeString(
        userData?.name
      ) ||
      null,

    startedAt:
      nowTs(),

    createdAt:
      nowTs(),

    updatedAt:
      nowTs(),
  });

  let context;

  try {
    context =
      await loadMagicTouchWhatsAppTemplateContext({
        db: db as any,
        agentId,
        templateName,
      });
  } catch (
    error: any
  ) {
    await campaignRef.set(
      {
        status:
          "failed",

        failedCount:
          contactIds.length,

        error:
          error?.message ||
          String(error),

        completedAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    throw error;
  }

  let sent = 0;
  let failed = 0;

  const results:
    CampaignResultItem[] = [];

  for (
    const contactId of
    contactIds
  ) {
    const recipientRef =
      campaignRef
        .collection(
          "recipients"
        )
        .doc(contactId);

    await recipientRef.set(
      {
        campaignId,
        agentId,
        contactId,

        status:
          "processing",

        templateName,

        createdAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    try {
      const result =
        await sendMagicTouchTemplateToContact({
          db: db as any,
          context,

          contactId,

          createdBy:
            authUid,

          campaignId,
        });

      sent++;

      await recipientRef.set(
        {
          status:
            "accepted",

          phoneNormalized:
            result.phoneNormalized,

          conversationId:
            result.conversationId,

          waMessageId:
            result.waMessageId,

          timelineEventId:
            result.timelineEventId,

          sentAt:
            nowTs(),

          error:
            null,

          updatedAt:
            nowTs(),
        },
        {
          merge:
            true,
        }
      );

      results.push({
        contactId,
        ok:
          true,

        waMessageId:
          result.waMessageId,

        conversationId:
          result.conversationId,
      });
    } catch (
      error: any
    ) {
      failed++;

      const errorMessage =
        error?.message ||
        String(error);

      console.error(
        "[sendMagicTouchWhatsAppCampaign] Recipient failed",
        {
          agentId,
          campaignId,
          contactId,
          error:
            errorMessage,
        }
      );

      await recipientRef.set(
        {
          status:
            "failed",

          error:
            errorMessage,

          failedAt:
            nowTs(),

          updatedAt:
            nowTs(),
        },
        {
          merge:
            true,
        }
      );

      results.push({
        contactId,
        ok:
          false,

        error:
          errorMessage,
      });
    }

    /*
     * מעדכנים התקדמות אחרי כל נמען,
     * כדי שהמסך העתידי יוכל להציג התקדמות בזמן אמת.
     */
    await campaignRef.set(
      {
        sentCount:
          sent,

        failedCount:
          failed,

        processedCount:
          sent +
          failed,

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );
  }

  const finalStatus =
    failed === 0
      ? "completed"
      : sent > 0
        ? "completed_with_errors"
        : "failed";

  await campaignRef.set(
    {
      status:
        finalStatus,

      sentCount:
        sent,

      failedCount:
        failed,

      processedCount:
        sent +
        failed,

      completedAt:
        nowTs(),

      updatedAt:
        nowTs(),
    },
    {
      merge:
        true,
    }
  );

  return {
    ok:
      failed === 0,

    partialSuccess:
      sent > 0 &&
      failed > 0,

    agentId,
    campaignId,

    campaignName:
      finalCampaignName,

    templateName,

    received:
      contactIds.length,

    sent,
    failed,

    status:
      finalStatus,

    results,
  };
}