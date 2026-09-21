/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  randomUUID,
} from "node:crypto";

import {
  logger,
} from "firebase-functions";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  sendWhatsAppConversationText,
} from "./shared/sendWhatsAppConversationText";

import {
  prepareCommissionAssistantRun,
} from "./shared/commissionAssistant/commissionAssistantRuns";

const RUNNER_ONLINE_MAX_AGE_MS =
  30 *
  1000;

const AUTO_RESUME_LOCK_MAX_AGE_MS =
  90 *
  1000;

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function timestampToMillis(
  value: any
): number | null {
  if (
    !value
  ) {
    return null;
  }

  if (
    typeof value ===
      "number"
  ) {
    return value;
  }

  if (
    value instanceof
      Date
  ) {
    return value.getTime();
  }

  if (
    typeof value?.toMillis ===
      "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value?._seconds ===
      "number"
  ) {
    return (
      value._seconds *
      1000
    );
  }

  if (
    typeof value?.seconds ===
      "number"
  ) {
    return (
      value.seconds *
      1000
    );
  }

  return null;
}

async function sendAssistantMessage({
  whatsappAgentId,
  conversationId,
  text,
  buttons,
}: {
  whatsappAgentId: string;
  conversationId: string;
  text: string;
  buttons?: Array<{
    id: string;
    title: string;
  }>;
}): Promise<void> {
  await sendWhatsAppConversationText({
    agentId:
      whatsappAgentId,

    conversationId,

    text,

    buttons:
      buttons ||
      [],

    sentBy:
      "commission_assistant",

    sentByName:
      "MagicSale עמלות",

    source:
      "commission_assistant" as any,
  });
}

async function releaseAutoResumeLock({
  db,
  sessionRef,
  attemptId,
  errorMessage,
}: {
  db: FirebaseFirestore.Firestore;
  sessionRef: FirebaseFirestore.DocumentReference;
  attemptId: string;
  errorMessage?: string | null;
}): Promise<void> {
  await db.runTransaction(
    async (
      transaction
    ) => {
      const snap =
        await transaction.get(
          sessionRef
        );

      if (
        !snap.exists
      ) {
        return;
      }

      const data =
        snap.data() as any;

      if (
        s(
          data?.state
        ) !==
          "updating_runner"
      ) {
        return;
      }

      if (
        s(
          data
            ?.autoResumeLock
            ?.attemptId
        ) !==
          attemptId
      ) {
        return;
      }

      transaction.set(
        sessionRef,
        {
          autoResumeLock:
            null,

          autoResumeLastError:
            errorMessage
              ? s(
                  errorMessage
                )
              : null,

          autoResumeLastErrorAt:
            errorMessage
              ? nowTs()
              : null,

          updatedAt:
            nowTs(),
        },
        {
          merge:
            true,
        }
      );
    }
  );
}

function buildSkippedSuffix(
  preparation: Extract<
    Awaited<
      ReturnType<
        typeof prepareCommissionAssistantRun
      >
    >,
    {
      state: "batch_created";
    }
  >
): string {
  const skippedCompleted =
    preparation
      .skippedCompletedCompanies
      .map(
        (
          company
        ) =>
          company.name
      );

  const skippedRunning =
    preparation
      .skippedRunningCompanies
      .map(
        (
          company
        ) =>
          company.name
      );

  const lines = [
    skippedCompleted.length >
      0
      ? `לא נשלחו כי כבר הושלמו החודש: ${skippedCompleted.join(", ")}`
      : "",

    skippedRunning.length >
      0
      ? `לא נשלחו כי כבר נמצאות בריצה: ${skippedRunning.join(", ")}`
      : "",
  ]
    .filter(
      Boolean
    );

  return lines.length >
    0
    ? `\n\n${lines.join("\n")}`
    : "";
}

export async function resumeCommissionAssistantAfterRunnerUpdateImpl(
  event: any
): Promise<object> {
  const agentId =
    s(
      event
        ?.params
        ?.agentId
    );

  if (
    !agentId
  ) {
    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "missing_agent_id",
    };
  }

  const after =
    event
      ?.data
      ?.after
      ?.exists
      ? event.data.after.data()
      : null;

  if (
    !after
  ) {
    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "runner_status_deleted",
    };
  }

  const runnerId =
    s(
      after?.runnerId
    );

  const runnerVersion =
    s(
      after?.runnerVersion
    );

  const lastSeenAtMs =
    timestampToMillis(
      after?.lastSeenAt
    );

  const runnerOnline =
    Boolean(
      runnerId &&
      lastSeenAtMs &&
      Date.now() -
        lastSeenAtMs <
        RUNNER_ONLINE_MAX_AGE_MS
    );

  if (
    !runnerOnline ||
    !runnerVersion
  ) {
    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "runner_not_ready",
    };
  }

  const db =
    adminDb();

  const sessionRef =
    db.doc(
      `agents/${agentId}/commission_assistant_sessions/current`
    );

  const sessionSnap =
    await sessionRef.get();

  if (
    !sessionSnap.exists
  ) {
    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "commission_session_missing",
    };
  }

  const session =
    sessionSnap.data() as any;

  if (
    s(
      session?.state
    ) !==
      "updating_runner"
  ) {
    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "session_not_waiting_for_update",
    };
  }

  const sessionId =
    s(
      session?.sessionId
    );

  const updateRunId =
    s(
      session?.updateRunId
    );

  const whatsappAgentId =
    s(
      session?.whatsappAgentId
    );

  const conversationId =
    s(
      session?.conversationId
    );

  const selectedCompanies =
    Array.isArray(
      session?.selectedCompanies
    )
      ? session.selectedCompanies
      : [];

  if (
    !sessionId ||
    !updateRunId ||
    !whatsappAgentId ||
    !conversationId ||
    selectedCompanies.length ===
      0
  ) {
    logger.warn(
      "[commissionAssistantAutoResume] Session is missing required continuation data",
      {
        agentId,
        sessionId,
        updateRunId,
        whatsappAgentId,
        conversationId,
        selectedCompaniesCount:
          selectedCompanies.length,
      }
    );

    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "session_missing_continuation_data",
    };
  }

  const updateRunRef =
    db.doc(
      `portalImportRuns/${updateRunId}`
    );

  const updateRunSnap =
    await updateRunRef.get();

  if (
    !updateRunSnap.exists
  ) {
    logger.warn(
      "[commissionAssistantAutoResume] Update run was not found",
      {
        agentId,
        updateRunId,
      }
    );

    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "update_run_missing",
    };
  }

  const updateRun =
    updateRunSnap.data() as any;

  const targetVersion =
    s(
      updateRun?.targetVersion
    );


  if (
    !targetVersion
  ) {
    logger.warn(
      "[commissionAssistantAutoResume] Update run has no targetVersion",
      {
        agentId,
        updateRunId,
      }
    );

    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "update_target_version_missing",
    };
  }

  if (
    runnerVersion !==
      targetVersion
  ) {
    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "runner_has_not_reached_target_version",

      runnerVersion,

      targetVersion,
    };
  }

  /*
   * חשוב:
   * runnerId מייצג את מופע ה-Runner הפעיל ויכול להשתנות אחרי התקנה/Restart.
   * לכן אסור לדרוש שהוא יהיה זהה ל-reservedRunnerId של ריצת ה-self_update.
   *
   * מקור האמת לסיום העדכון הוא:
   * 1. אותו agentId (נובע מנתיב portalRunnerStatus/{agentId})
   * 2. heartbeat טרי
   * 3. runnerVersion === targetVersion
   *
   * כאשר prepareCommissionAssistantRun() יוצר את ה-Batch,
   * הוא יקרא מחדש את ה-runnerId הנוכחי וישמור אותו כ-reservedRunnerId החדש.
   */

  const attemptId =
    randomUUID();

  const claimed =
    await db.runTransaction(
      async (
        transaction
      ) => {
        const freshSnap =
          await transaction.get(
            sessionRef
          );

        if (
          !freshSnap.exists
        ) {
          return false;
        }

        const fresh =
          freshSnap.data() as any;

        if (
          s(
            fresh?.state
          ) !==
            "updating_runner" ||
          s(
            fresh?.sessionId
          ) !==
            sessionId ||
          s(
            fresh?.updateRunId
          ) !==
            updateRunId
        ) {
          return false;
        }

        const existingLock =
          fresh
            ?.autoResumeLock ||
          null;

        const existingLockAtMs =
          timestampToMillis(
            existingLock
              ?.claimedAt
          );

        const lockStillActive =
          Boolean(
            existingLock &&
            s(
              existingLock
                ?.updateRunId
            ) ===
              updateRunId &&
            existingLockAtMs &&
            Date.now() -
              existingLockAtMs <
              AUTO_RESUME_LOCK_MAX_AGE_MS
          );

        if (
          lockStillActive
        ) {
          return false;
        }

        transaction.set(
          sessionRef,
          {
            autoResumeLock: {
              attemptId,

              updateRunId,

              targetVersion,

              claimedAt:
                new Date(),
            },

            autoResumeLastError:
              null,

            autoResumeLastErrorAt:
              null,

            updatedAt:
              nowTs(),
          },
          {
            merge:
              true,
          }
        );

        return true;
      }
    );

  if (
    !claimed
  ) {
    return {
      ok:
        true,

      skipped:
        true,

      reason:
        "auto_resume_already_claimed_or_session_changed",
    };
  }

  logger.info(
    "[commissionAssistantAutoResume] Runner reached target version; continuing commission request",
    {
      agentId,
      runnerId,
      runnerVersion,
      targetVersion,
      updateRunId,
      sessionId,
    }
  );

  try {
    const preparation =
      await prepareCommissionAssistantRun({
        db,

        requesterAgentId:
          agentId,

        whatsappAgentId,

        conversationId,

        sessionId,

        selectedCompanies,
      });

    if (
      preparation.state ===
        "batch_created"
    ) {
      const finalized =
        await db.runTransaction(
          async (
            transaction
          ) => {
            const freshSnap =
              await transaction.get(
                sessionRef
              );

            if (
              !freshSnap.exists
            ) {
              return false;
            }

            const fresh =
              freshSnap.data() as any;

            if (
              s(
                fresh?.state
              ) !==
                "updating_runner" ||
              s(
                fresh?.sessionId
              ) !==
                sessionId ||
              s(
                fresh
                  ?.autoResumeLock
                  ?.attemptId
              ) !==
                attemptId
            ) {
              return false;
            }

            transaction.set(
              sessionRef,
              {
                state:
                  "batch_created",

                batchId:
                  preparation.batchId,

                runIds:
                  preparation.runIds,

                reservedRunnerId:
                  preparation.runnerId,

                runnerVersionAtStart:
                  preparation.runnerVersion,

                batchCreatedAt:
                  new Date(),

                autoResumeLock:
                  null,

                autoResumeCompletedAt:
                  new Date(),

                autoResumeLastError:
                  null,

                autoResumeLastErrorAt:
                  null,

                updatedAt:
                  nowTs(),
              },
              {
                merge:
                  true,
              }
            );

            return true;
          }
        );

      if (
        !finalized
      ) {
        return {
          ok:
            true,

          skipped:
            true,

          reason:
            "session_changed_before_batch_finalize",
        };
      }

      const suffix =
        buildSkippedSuffix(
          preparation
        );

      try {
        await sendAssistantMessage({
          whatsappAgentId,
          conversationId,

          text:
            preparation.alreadyExisted
              ? `העדכון הושלם בהצלחה ✅\n\nה-Runner חזר בגרסה ${preparation.runnerVersion}. ריצת העמלות כבר קיימת ונשלחה ל-Runner.${suffix}`
              : `העדכון הושלם בהצלחה ✅\n\nה-Runner חזר בגרסה ${preparation.runnerVersion}, וריצת העמלות יצאה לדרך אוטומטית.\nנוצר Batch עם ${preparation.runIds.length} חברות והן ירוצו אחת אחרי השנייה.${suffix}`,
        });
      } catch (
        messageError: any
      ) {
        logger.error(
          "[commissionAssistantAutoResume] Batch created but WhatsApp confirmation failed",
          {
            agentId,
            sessionId,
            batchId:
              preparation.batchId,
            error:
              messageError?.message ||
              String(
                messageError
              ),
          }
        );
      }

      return {
        ok:
          true,

        resumed:
          true,

        state:
          "batch_created",

        batchId:
          preparation.batchId,

        runIds:
          preparation.runIds,
      };
    }

    if (
      preparation.state ===
        "nothing_to_run"
    ) {
      const completedNames =
        preparation
          .completedCompanies
          .map(
            (
              company
            ) =>
              company.name
          )
          .join(
            ", "
          );

      const runningNames =
        preparation
          .runningCompanies
          .map(
            (
              company
            ) =>
              company.name
          )
          .join(
            ", "
          );

      const details = [
        completedNames
          ? `כבר הושלמו: ${completedNames}`
          : "",

        runningNames
          ? `כבר בריצה: ${runningNames}`
          : "",
      ]
        .filter(
          Boolean
        )
        .join(
          "\n"
        );

      const finalized =
        await db.runTransaction(
          async (
            transaction
          ) => {
            const freshSnap =
              await transaction.get(
                sessionRef
              );

            if (
              !freshSnap.exists
            ) {
              return false;
            }

            const fresh =
              freshSnap.data() as any;

            if (
              s(
                fresh?.state
              ) !==
                "updating_runner" ||
              s(
                fresh?.sessionId
              ) !==
                sessionId ||
              s(
                fresh
                  ?.autoResumeLock
                  ?.attemptId
              ) !==
                attemptId
            ) {
              return false;
            }

            transaction.set(
              sessionRef,
              {
                state:
                  "cancelled",

                cancelReason:
                  "monthly_run_already_completed",

                reportYm:
                  preparation.reportYm,

                autoResumeLock:
                  null,

                autoResumeCompletedAt:
                  new Date(),

                updatedAt:
                  nowTs(),
              },
              {
                merge:
                  true,
              }
            );

            return true;
          }
        );

      if (
        finalized
      ) {
        try {
          await sendAssistantMessage({
            whatsappAgentId,
            conversationId,

            text:
              `העדכון הושלם ✅\n\nבזמן העדכון מצב הדוחות השתנה, ואין כרגע חברה חדשה להרצה עבור חודש הדוח ${preparation.reportYm}.` +
              (
                details
                  ? `\n\n${details}`
                  : ""
              ) +
              "\n\nאם תרצה להתחיל בחירה חדשה, כתוב \"הרץ לי עמלות\".",
          });
        } catch (
          messageError: any
        ) {
          logger.error(
            "[commissionAssistantAutoResume] Nothing-to-run WhatsApp message failed",
            {
              agentId,
              sessionId,
              error:
                messageError?.message ||
                String(
                  messageError
                ),
            }
          );
        }
      }

      return {
        ok:
          true,

        resumed:
          true,

        state:
          "nothing_to_run",
      };
    }

    if (
      preparation.state ===
        "runner_updating"
    ) {
      await db.runTransaction(
        async (
          transaction
        ) => {
          const freshSnap =
            await transaction.get(
              sessionRef
            );

          if (
            !freshSnap.exists
          ) {
            return;
          }

          const fresh =
            freshSnap.data() as any;

          if (
            s(
              fresh?.state
            ) !==
              "updating_runner" ||
            s(
              fresh?.sessionId
            ) !==
              sessionId ||
            s(
              fresh
                ?.autoResumeLock
                ?.attemptId
            ) !==
              attemptId
          ) {
            return;
          }

          transaction.set(
            sessionRef,
            {
              updateRunId:
                preparation.updateRunId,

              autoResumeLock:
                null,

              updatedAt:
                nowTs(),
            },
            {
              merge:
                true,
            }
          );
        }
      );

      return {
        ok:
          true,

        resumed:
          false,

        reason:
          "newer_runner_update_required",

        updateRunId:
          preparation.updateRunId,

        latestVersion:
          preparation.latestVersion,
      };
    }

    if (
      preparation.state ===
        "runner_offline"
    ) {
      await releaseAutoResumeLock({
        db,
        sessionRef,
        attemptId,
      });

      return {
        ok:
          true,

        resumed:
          false,

        reason:
          "runner_became_offline_before_batch_creation",
      };
    }

    if (
      preparation.state ===
        "runner_update_unavailable"
    ) {
      await db.runTransaction(
        async (
          transaction
        ) => {
          const freshSnap =
            await transaction.get(
              sessionRef
            );

          if (
            !freshSnap.exists
          ) {
            return;
          }

          const fresh =
            freshSnap.data() as any;

          if (
            s(
              fresh?.state
            ) !==
              "updating_runner" ||
            s(
              fresh?.sessionId
            ) !==
              sessionId ||
            s(
              fresh
                ?.autoResumeLock
                ?.attemptId
            ) !==
              attemptId
          ) {
            return;
          }

          transaction.set(
            sessionRef,
            {
              state:
                "waiting_runner",

              autoResumeLock:
                null,

              updatedAt:
                nowTs(),
            },
            {
              merge:
                true,
            }
          );
        }
      );

      try {
        await sendAssistantMessage({
          whatsappAgentId,
          conversationId,

          text:
            `ה-Runner חזר, אבל בינתיים נדרשת גרסה ${preparation.latestVersion || "חדשה יותר"} ואין כרגע קובץ עדכון אוטומטי זמין. יש לעדכן את ה-Runner ואז ללחוץ "בדוק שוב".`,

          buttons: [
            {
              id:
                "commission_retry_runner",

              title:
                "בדוק שוב",
            },
            {
              id:
                "commission_cancel",

              title:
                "ביטול",
            },
          ],
        });
      } catch (
        messageError: any
      ) {
        logger.error(
          "[commissionAssistantAutoResume] Update-unavailable WhatsApp message failed",
          {
            agentId,
            sessionId,
            error:
              messageError?.message ||
              String(
                messageError
              ),
          }
        );
      }

      return {
        ok:
          true,

        resumed:
          false,

        state:
          "runner_update_unavailable",
      };
    }

    await releaseAutoResumeLock({
      db,
      sessionRef,
      attemptId,
    });

    return {
      ok:
        true,

      resumed:
        false,

      reason:
        "unexpected_prepare_state",
    };
  } catch (
    error: any
  ) {
    const errorMessage =
      error?.message ||
      String(
        error
      );

    logger.error(
      "[commissionAssistantAutoResume] Failed to continue after Runner update",
      {
        agentId,
        runnerId,
        runnerVersion,
        targetVersion,
        updateRunId,
        sessionId,
        error:
          errorMessage,
      }
    );

    await releaseAutoResumeLock({
      db,
      sessionRef,
      attemptId,
      errorMessage,
    }).catch(
      () => undefined
    );

    return {
      ok:
        false,

      resumed:
        false,

      reason:
        "auto_resume_failed",

      error:
        errorMessage,
    };
  }
}
