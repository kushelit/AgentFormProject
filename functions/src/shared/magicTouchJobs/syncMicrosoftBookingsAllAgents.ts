/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  adminDb,
} from "../admin";

import {
  syncMicrosoftBookingsAgent,
} from "../microsoftBookingsSync";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function errorMessage(
  error: unknown
): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    return s(
      (
        error as {
          message?: unknown;
        }
      ).message
    ) || "Unknown error";
  }

  return s(error) ||
    "Unknown error";
}

function agentIdFromBookingsConfigPath(
  path: string
): string {
  const parts =
    path
      .split("/")
      .filter(Boolean);

  /*
   * Expected path:
   * agents/{agentId}/config/microsoftBookings
   */
  if (
    parts.length !== 4 ||
    parts[0] !== "agents" ||
    parts[2] !== "config" ||
    parts[3] !== "microsoftBookings"
  ) {
    return "";
  }

  return s(
    parts[1]
  );
}

export async function syncMicrosoftBookingsAllAgents():
Promise<Record<string, unknown>> {
  const db =
    adminDb();

  /*
   * חשוב:
   * אצלנו מסמך agents/{agentId} לא בהכרח קיים.
   * לכן לא ניתן להסתמך על collection("agents").get().
   *
   * במקום זה מחפשים את כל מסמכי config בכל המערכת
   * ומסננים רק microsoftBookings.
   */
  const configSnap =
    await db
      .collectionGroup(
        "config"
      )
      .get();

  let checkedAgents =
    0;

  let connectedAgents =
    0;

  let syncedAgents =
    0;

  let failedAgents =
    0;

  let totalAppointments =
    0;

  let totalMatched =
    0;

  let totalUnmatched =
    0;

  let totalCreatedEvents =
    0;

  let totalCancelledEvents =
    0;

  const failures:
    Array<{
      agentId: string;
      error: string;
    }> = [];

  const agentResults:
    Array<Record<string, unknown>> = [];

  for (
    const configDoc of
    configSnap.docs
  ) {
    /*
     * collectionGroup("config") יחזיר גם:
     * agents/{agentId}/config/main
     * agents/{agentId}/config/whatsapp
     * וכו'.
     *
     * אותנו מעניין רק:
     * config/microsoftBookings
     */
    if (
      configDoc.id !==
      "microsoftBookings"
    ) {
      continue;
    }

    const agentId =
      agentIdFromBookingsConfigPath(
        configDoc.ref.path
      );

    if (!agentId) {
      continue;
    }

    checkedAgents +=
      1;

    const config =
      configDoc.data() as any;

    if (
      config?.connected !==
      true
    ) {
      continue;
    }

    connectedAgents +=
      1;

    try {
      const result =
        await syncMicrosoftBookingsAgent(
          agentId
        ) as Record<
          string,
          any
        >;

      syncedAgents +=
        1;

      const appointments =
        Number(
          result?.appointments ||
          0
        );

      const matched =
        Number(
          result?.matched ||
          0
        );

      const unmatched =
        Number(
          result?.unmatched ||
          0
        );

      const createdEvents =
        Number(
          result?.createdEvents ||
          0
        );

      const cancelledEvents =
        Number(
          result?.cancelledEvents ||
          0
        );

      totalAppointments +=
        appointments;

      totalMatched +=
        matched;

      totalUnmatched +=
        unmatched;

      totalCreatedEvents +=
        createdEvents;

      totalCancelledEvents +=
        cancelledEvents;

      agentResults.push({
        agentId,

        status:
          "success",

        appointments,

        matched,

        unmatched,

        createdEvents,

        cancelledEvents,
      });
    } catch (
      error
    ) {
      failedAgents +=
        1;

      const message =
        errorMessage(
          error
        );

      failures.push({
        agentId,
        error:
          message,
      });

      agentResults.push({
        agentId,

        status:
          "failed",

        error:
          message,
      });

      console.error(
        "[syncMicrosoftBookingsAllAgents] Agent sync failed",
        {
          agentId,
          error:
            message,
        }
      );
    }
  }

  return {
    checkedAgents,

    connectedAgents,

    syncedAgents,

    failedAgents,

    appointments:
      totalAppointments,

    matched:
      totalMatched,

    unmatched:
      totalUnmatched,

    createdEvents:
      totalCreatedEvents,

    cancelledEvents:
      totalCancelledEvents,

    partialFailure:
      failedAgents > 0,

    failures,

    agentResults,
  };
}