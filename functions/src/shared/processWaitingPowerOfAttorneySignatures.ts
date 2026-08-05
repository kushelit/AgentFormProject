/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "firebase-functions";
import { adminDb } from "./admin";
import {
  checkSinglePowerOfAttorneySignature,
} from "./checkSinglePowerOfAttorneySignature";

export type ProcessWaitingPowerOfAttorneySignaturesResult = {
  scanned: number;
  processed: number;
  signed: number;
  partiallySigned: number;
  waiting: number;
  remindersDue: number;
  skipped: number;
  failed: number;
  errors: Array<{
    documentPath: string;
    agentId: string | null;
    contactId: string;
    error: string;
  }>;
};

const s = (
  value: unknown
): string =>
  String(value ?? "").trim();

function agentIdFromPath(
  path: string
): string {
  const parts =
    path.split("/");

  const agentIndex =
    parts.indexOf(
      "agents"
    );

  return agentIndex >= 0
    ? s(
      parts[
        agentIndex +
        1
      ]
    )
    : "";
}

export async function processWaitingPowerOfAttorneySignatures():
Promise<ProcessWaitingPowerOfAttorneySignaturesResult> {
  const db =
    adminDb();

  /*
   * סריקה של כל אנשי הקשר מכל הסוכנים,
   * אבל כל מסמך נבדק מול agentId ששמור בתוכו
   * ומול agentId שבנתיב.
   */
  const contactsSnap =
    await db
      .collectionGroup(
        "magic_touch_contacts"
      )
      .where(
        "engagement.reengagement.powerOfAttorney.status",
        "in",
        [
          "waiting_for_signature",
          "partially_signed",
        ]
      )
      .get();

  const result:
    ProcessWaitingPowerOfAttorneySignaturesResult = {
      scanned:
        contactsSnap.size,
      processed:
        0,
      signed:
        0,
      partiallySigned:
        0,
      waiting:
        0,
      remindersDue:
        0,
      skipped:
        0,
      failed:
        0,
      errors:
        [],
    };

  for (
    const contactDoc of
    contactsSnap.docs
  ) {
    const contact =
      contactDoc.data() as
        Record<string, any>;

    const contactId =
      contactDoc.id;

    const storedAgentId =
      s(
        contact?.agentId
      );

    const pathAgentId =
      agentIdFromPath(
        contactDoc.ref.path
      );

    /*
     * ולידציה קריטית:
     * לא נבצע קריאה לשורנס אם הלקוח אינו משויך
     * באופן חד-משמעי לאותו סוכן.
     */
    if (
      !storedAgentId ||
      !pathAgentId ||
      storedAgentId !==
        pathAgentId
    ) {
      result.skipped++;

      const error =
        !storedAgentId
          ? "Contact is missing agentId"
          : !pathAgentId
            ? "Could not resolve agentId from document path"
            : "Stored agentId does not match path agentId";

      result.errors.push({
        documentPath:
          contactDoc.ref.path,
        agentId:
          storedAgentId ||
          pathAgentId ||
          null,
        contactId,
        error,
      });

      logger.error(
        "[processWaitingPowerOfAttorneySignatures] contact skipped due to agent mismatch",
        {
          documentPath:
            contactDoc.ref.path,
          storedAgentId:
            storedAgentId ||
            null,
          pathAgentId:
            pathAgentId ||
            null,
          contactId,
        }
      );

      continue;
    }

    if (
      s(
        contact
          ?.sourceSystem
      ) !==
      "surense"
    ) {
      result.skipped++;

      logger.warn(
        "[processWaitingPowerOfAttorneySignatures] non-Surense contact skipped",
        {
          documentPath:
            contactDoc.ref.path,
          agentId:
            storedAgentId,
          contactId,
          sourceSystem:
            s(
              contact
                ?.sourceSystem
            ) ||
            null,
        }
      );

      continue;
    }

    try {
      const checkResult =
        await checkSinglePowerOfAttorneySignature({
          agentId:
            storedAgentId,
          contactId,
        });

      result.processed++;

      if (
        checkResult.status ===
        "signed"
      ) {
        result.signed++;
      } else if (
        checkResult.status ===
        "partially_signed"
      ) {
        result.partiallySigned++;
      } else {
        result.waiting++;
      }

      if (
        checkResult.reminderDue
      ) {
        result.remindersDue++;
      }
    } catch (
      error: any
    ) {
      const message =
        error?.message ||
        String(error);

      result.failed++;

      result.errors.push({
        documentPath:
          contactDoc.ref.path,
        agentId:
          storedAgentId,
        contactId,
        error:
          message,
      });

      logger.error(
        "[processWaitingPowerOfAttorneySignatures] contact failed",
        {
          documentPath:
            contactDoc.ref.path,
          agentId:
            storedAgentId,
          contactId,
          error:
            message,
        }
      );
    }
  }

  logger.info(
    "[processWaitingPowerOfAttorneySignatures] completed",
    result
  );

  return result;
}
