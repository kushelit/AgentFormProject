/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  nowTs,
} from "../admin";

import {
  sendWhatsAppConversationText,
} from "../sendWhatsAppConversationText";

import {
  buildImportInsightsForPortalRun,
} from "../buildImportInsights";

import {
  buildBatchImportInsightsEmailHtml,
  type BatchCompanyResult,
} from "../buildBatchImportInsightsEmailHtml";

import {
  sendSystemEmail,
} from "../sendgrid";

const CLIENT_FINAL_RUN_STATUSES =
  new Set([
    "success",
    "done",
    "error",
    "failed",
    "skipped",
  ]);

const BUSINESS_FINAL_RUN_STATUSES =
  new Set([
    "success",
    "error",
    "failed",
    "skipped",
  ]);

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

type MissingReport = {
  templateId: string;
  templateName?: string;
  status: string;
};

type BatchRun = {
  id: string;
  companyId: string;
  companyName: string;
  status: string;
  step: string;
  batchOrder: number;
  missingReports?: MissingReport[];
};

function buildWhatsAppSummary({
  finalStatus,
  runs,
}: {
  finalStatus:
    "success" |
    "partial" |
    "error";

  runs:
    BatchRun[];
}): string {
  const successful =
    runs.filter(
      (
        run
      ) =>
        run.status ===
          "success"
    );

  const failed =
    runs.filter(
      (
        run
      ) =>
        run.status ===
          "error" ||
        run.status ===
          "failed"
    );

  const skipped =
    runs.filter(
      (
        run
      ) =>
        run.status ===
          "skipped"
    );

  const lines:
    string[] = [];

  if (
    finalStatus ===
      "success"
  ) {
    lines.push(
      "ריצת העמלות הסתיימה בהצלחה ✅"
    );
  } else if (
    finalStatus ===
      "partial"
  ) {
    lines.push(
      "ריצת העמלות הסתיימה חלקית ⚠️"
    );
  } else {
    lines.push(
      "ריצת העמלות הסתיימה עם שגיאות ❌"
    );
  }

  lines.push(
    ""
  );

  lines.push(
    `הושלמו: ${successful.length}`
  );

  if (
    failed.length >
    0
  ) {
    lines.push(
      `שגיאות: ${failed.length}`
    );
  }

  if (
    skipped.length >
    0
  ) {
    lines.push(
      `דולגו: ${skipped.length}`
    );
  }

  if (
    failed.length >
    0
  ) {
    lines.push(
      ""
    );

    lines.push(
      `חברות עם שגיאה: ${failed
        .map(
          (
            run
          ) =>
            run.companyName ||
            run.companyId
        )
        .join(
          ", "
        )}`
    );
  }

  /*
   * לא משנים שום סטטוס ולא מגדירים "הצלחה חלקית" חדשה.
   *
   * מציגים בלבד את אותו מידע שה-Dashboard כבר מציג היום:
   * reportsSummary עם status !== "ok"
   * +
   * missingAgents כמופעי meitav_insurance שלא ירדו.
   *
   * חברה יכולה להישאר success + import_done ובמקביל לקבל
   * אזהרה אינפורמטיבית על דוחות שלא נקלטו.
   */
  const runsWithMissingReports =
    runs.filter(
      (
        run
      ) =>
        Array.isArray(
          run.missingReports
        ) &&
        run.missingReports.length >
          0
    );

  if (
    runsWithMissingReports.length >
      0
  ) {
    lines.push(
      ""
    );

    for (
      const run of
      runsWithMissingReports
    ) {
      const companyName =
        run.companyName ||
        run.companyId ||
        "חברה";

      const reportNames =
        (
          run.missingReports ||
          []
        )
          .map(
            (
              report
            ) =>
              s(
                report
                  ?.templateName
              ) ||
              s(
                report
                  ?.templateId
              )
          )
          .filter(
            Boolean
          );

      if (
        reportNames.length ===
          0
      ) {
        continue;
      }

      lines.push(
        `⚠️ ${companyName} – דוחות שלא נקלטו: ${reportNames.join(
          ", "
        )}`
      );
    }
  }

  lines.push(
    ""
  );

  lines.push(
    "מייל סיכום נשלח בנפרד עבור כל חברה שהשלימה את שלב קליטת הנתונים בהצלחה."
  );

  return lines.join(
    "\n"
  );
}

async function claimCommissionAssistantSummary({
  db,
  batchRef,
}: {
  db:
    FirebaseFirestore.Firestore;

  batchRef:
    FirebaseFirestore.DocumentReference;
}): Promise<boolean> {
  let claimed =
    false;

  await db.runTransaction(
    async (
      transaction
    ) => {
      const snap =
        await transaction.get(
          batchRef
        );

      if (
        !snap.exists
      ) {
        return;
      }

      const data =
        snap.data() as
          Record<
            string,
            any
          >;

      if (
        data
          ?.commissionAssistantSummarySentAt
      ) {
        return;
      }

      const sendingAtMs =
        timestampToMillis(
          data
            ?.commissionAssistantSummarySendingAt
        );

      /*
       * הגנה מפני שני Trigger-ים שמגיעים כמעט יחד.
       * Claim תקוע מעל 2 דקות מותר לנסות שוב.
       */
      if (
        sendingAtMs &&
        Date.now() -
          sendingAtMs <
          2 *
            60 *
            1000
      ) {
        return;
      }

      transaction.set(
        batchRef,
        {
          commissionAssistantSummarySendingAt:
            nowTs(),

          commissionAssistantSummaryError:
            null,

          updatedAt:
            nowTs(),
        },
        {
          merge:
            true,
        }
      );

      claimed =
        true;
    }
  );

  return claimed;
}

async function claimBatchSummaryEmail({
  db,
  batchRef,
}: {
  db: FirebaseFirestore.Firestore;
  batchRef: FirebaseFirestore.DocumentReference;
}): Promise<boolean> {
  let claimed = false;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(batchRef);
    if (!snap.exists) return;

    const data = snap.data() as Record<string, any>;

    if (data?.emailBatchSummarySentAt) return;

    const sendingAtMs = timestampToMillis(data?.emailBatchSummarySendingAt);

    // הגנה מפני שני Trigger-ים שמגיעים כמעט יחד - claim תקוע מעל 2 דקות מותר לנסות שוב
    if (sendingAtMs && Date.now() - sendingAtMs < 2 * 60 * 1000) return;

    transaction.set(
      batchRef,
      {
        emailBatchSummarySendingAt: nowTs(),
        emailBatchSummaryError: null,
        updatedAt: nowTs(),
      },
      { merge: true }
    );

    claimed = true;
  });

  return claimed;
}

async function sendBatchSummaryEmailIfReady({
  db,
  batchId,
  batchRef,
  batchData,
  runs,
  finalStatus,
  sendgridApiKey,
}: {
  db: FirebaseFirestore.Firestore;
  batchId: string;
  batchRef: FirebaseFirestore.DocumentReference;
  batchData: Record<string, any>;
  runs: BatchRun[];
  finalStatus: "success" | "partial" | "error";
  sendgridApiKey: string;
}): Promise<void> {
  const agentId = s(batchData?.agentId);
  if (!agentId) return;

  const userSnap = await db.collection("users").doc(agentId).get();
  const user = userSnap.data() || {};
  const to = s(user.email);
  if (!to) return;

  const claimed = await claimBatchSummaryEmail({ db, batchRef });
  if (!claimed) return;

  try {
    const companies: BatchCompanyResult[] = [];

    for (const run of runs) {
      if (run.status === "success") {
        try {
          const insights = await buildImportInsightsForPortalRun(run.id);
          companies.push({
            companyName: run.companyName || run.companyId,
            status: "success",
            insights,
          });
        } catch (insightsError: any) {
          // אם לא הצלחנו לבנות insights לחברה הזו (למשל אין jobIds) - מציגים
          // אותה כשגיאה בטבלה, לא מפילים את כל שליחת המייל בגלל חברה אחת.
          console.error(
            "[commissionAssistantBatchFinalizer] Failed to build insights for run",
            { runId: run.id, error: insightsError?.message || String(insightsError) }
          );
          companies.push({ companyName: run.companyName || run.companyId, status: "error" });
        }
      } else {
        companies.push({
          companyName: run.companyName || run.companyId,
          status: run.status === "skipped" ? "skipped" : "error",
        });
      }
    }

    const agentName = s(user.name || user.fullName || user.displayName || "");
    const monthLabel = s(batchData?.monthLabel);

    const html = buildBatchImportInsightsEmailHtml({
      agentName,
      batchStatus: finalStatus,
      monthLabel,
      companies,
      appUrl: "https://www.magicsale.co.il/importCommissionHub/ExcelCommissionImporter",
    });

    const subject =
      finalStatus === "success"
        ? `📊 סיכום טעינת עמלות אוטומטית – ${companies.length} חברות`
        : finalStatus === "partial"
          ? `⚠️ סיכום טעינת עמלות אוטומטית – הושלם חלקית`
          : `❌ סיכום טעינת עמלות אוטומטית – הסתיים עם שגיאות`;

    await sendSystemEmail({
      apiKey: sendgridApiKey,
      to,
      subject,
      html,
      text: `טעינת העמלות האוטומטית הסתיימה. ${companies.filter((c) => c.status === "success").length}/${companies.length} חברות הושלמו בהצלחה.`,
      category: "import_insights_batch",
      meta: {
        batchId,
        agentId,
        companyCount: companies.length,
      },
    });

    await batchRef.set(
      {
        emailBatchSummarySentAt: nowTs(),
        emailBatchSummarySendingAt: null,
        emailBatchSummaryError: null,
        updatedAt: nowTs(),
      },
      { merge: true }
    );
  } catch (error: any) {
    await batchRef.set(
      {
        emailBatchSummarySendingAt: null,
        emailBatchSummaryError: {
          message: s(error?.message || error),
          failedAt: nowTs(),
        },
        updatedAt: nowTs(),
      },
      { merge: true }
    );

    console.error(
      "[commissionAssistantBatchFinalizer] Failed to send batch summary email",
      { batchId, error: error?.message || String(error) }
    );
  }
}

export async function finalizePortalRunBatchFromRunChange({
  db,
  runId,
  runData,
  sendgridApiKey,
}: {
  db:
    FirebaseFirestore.Firestore;

  runId:
    string;

  runData:
    Record<
      string,
      any
    >;

  sendgridApiKey:
    string;
}): Promise<void> {
  const batchId =
    s(
      runData?.batchId
    );

  if (
    !batchId
  ) {
    return;
  }

  const batchRef =
    db.doc(
      `portalRunBatches/${batchId}`
    );

  const batchSnap =
    await batchRef.get();

  if (
    !batchSnap.exists
  ) {
    return;
  }

  const runsSnap =
    await db
      .collection(
        "portalImportRuns"
      )
      .where(
        "batchId",
        "==",
        batchId
      )
      .get();

  if (
    runsSnap.empty
  ) {
    return;
  }

  const runs:
    BatchRun[] =
    runsSnap.docs
      .map(
        (
          doc
        ) => {
          const data =
            doc.data() as
              Record<
                string,
                any
              >;

          /*
           * אותה לוגיקה קיימת בדיוק מתוך useAutomationDashboardStatus:
           *
           * const reportsSummary = runData?.reportsSummary || [];
           * const missingAgents = runData?.missingAgents || [];
           * missingReports = [
           *   ...reportsSummary.filter((r) => r.status !== "ok"),
           *   ...missingAgents.map((a) => ({
           *     templateId: "meitav_insurance",
           *     templateName: `סוכן ${a.agentName}`,
           *     status: "not_downloaded",
           *   })),
           * ];
           */
          const reportsSummary:
            any[] =
            Array.isArray(
              data
                ?.reportsSummary
            )
              ? data
                  .reportsSummary
              : [];

          const missingAgents:
            any[] =
            Array.isArray(
              data
                ?.missingAgents
            )
              ? data
                  .missingAgents
              : [];

          const missingReports:
            MissingReport[] = [
              ...reportsSummary
                .filter(
                  (
                    report: any
                  ) =>
                    s(
                      report
                        ?.status
                    ) !==
                      "ok"
                )
                .map(
                  (
                    report: any
                  ) => ({
                    templateId:
                      s(
                        report
                          ?.templateId
                      ),

                    templateName:
                      s(
                        report
                          ?.templateName
                      ) ||
                      undefined,

                    status:
                      s(
                        report
                          ?.status
                      ),
                  })
                ),

              ...missingAgents.map(
                (
                  agent: any
                ) => ({
                  templateId:
                    "meitav_insurance",

                  templateName:
                    `סוכן ${s(
                      agent
                        ?.agentName
                    )}`,

                  status:
                    "not_downloaded",
                })
              ),
            ];

          return {
            id:
              doc.id,

            companyId:
              s(
                data
                  ?.companyId
              ),

            companyName:
              s(
                data
                  ?.companyName
              ),

            status:
              s(
                data
                  ?.status
              ),

            step:
              s(
                data
                  ?.step
              ),

            batchOrder:
              Number(
                data
                  ?.batchOrder ||
                0
              ),

            missingReports:
              missingReports.length >
                0
                ? missingReports
                : undefined,
          };
        }
      )
      .sort(
        (
          a,
          b
        ) =>
          a.batchOrder -
          b.batchOrder
      );

  /*
   * שלב א':
   * משחזרים בדיוק את לוגיקת ExcelCommissionImporter לסגירת batch:
   * done/success נחשבים done,
   * error/failed נחשבים error,
   * ו-skipped הוא סטטוס סופי.
   */
  const clientAllFinished =
    runs.every(
      (
        run
      ) =>
        CLIENT_FINAL_RUN_STATUSES.has(
          run.status
        )
    );

  if (
    clientAllFinished
  ) {
    const doneCount =
      runs.filter(
        (
          run
        ) =>
          run.status ===
            "success" ||
          run.status ===
            "done"
      ).length;

    const errorCount =
      runs.filter(
        (
          run
        ) =>
          run.status ===
            "error" ||
          run.status ===
            "failed"
      ).length;

    const finalStatus:
      "success" |
      "partial" |
      "error" =
      errorCount >
        0 &&
      doneCount ===
        0
        ? "error"
        : errorCount >
          0
          ? "partial"
          : "success";

    await batchRef.set(
      {
        status:
          finalStatus,

        finishedAt:
          nowTs(),

        updatedAt:
          nowTs(),

        doneCount,

        errorCount,
      },
      {
        merge:
          true,
      }
    );
  }

  /*
   * שלב ב':
   * חיווי WhatsApp נשלח רק אחרי סיום עסקי אמיתי של כל חברה.
   *
   * run.status="done" הוא עדיין שלב ביניים:
   * הקובץ ירד, אבל קליטת העמלות/queue יכולה עדיין לעבוד.
   * מייל הסיכום הקיים נשלח רק ב-success + import_done.
   *
   * לכן כאן לא שולחים "הסתיים" כל עוד נשאר run ב-done.
   */
  const businessAllFinished =
    runs.every(
      (
        run
      ) =>
        BUSINESS_FINAL_RUN_STATUSES.has(
          run.status
        )
    );

  if (
    !businessAllFinished
  ) {
    return;
  }

  const batchFreshSnap =
    await batchRef.get();

  if (
    !batchFreshSnap.exists
  ) {
    return;
  }

  const batchData =
    batchFreshSnap.data() as
      Record<
        string,
        any
      >;

  const successfulCount =
    runs.filter(
      (
        run
      ) =>
        run.status ===
          "success"
    ).length;

  const errorCount =
    runs.filter(
      (
        run
      ) =>
        run.status ===
          "error" ||
        run.status ===
          "failed"
    ).length;

  const finalStatus:
    "success" |
    "partial" |
    "error" =
    errorCount >
      0 &&
    successfulCount ===
      0
      ? "error"
      : errorCount >
        0
        ? "partial"
        : "success";

  /*
   * חדש: מייל סיכום batch למייל של הסוכן - רץ תמיד (לא רק ל-
   * commission_assistant), כי המטרה שלו שונה מהחיווי ב-WhatsApp: לתת
   * לסוכן שסימוכם דרך ה-UI מייל אחד מרוכז במקום מייל נפרד לכל חברה.
   * כשל כאן לא חוסם את חיווי ה-WhatsApp שממשיך מתחת.
   */
  try {
    await sendBatchSummaryEmailIfReady({
      db,
      batchId,
      batchRef,
      batchData,
      runs,
      finalStatus,
      sendgridApiKey,
    });
  } catch (emailError: any) {
    console.error(
      "[commissionAssistantBatchFinalizer] sendBatchSummaryEmailIfReady threw",
      { batchId, error: emailError?.message || String(emailError) }
    );
  }

  if (
    s(
      batchData
        ?.triggeredFrom
    ) !==
      "commission_assistant"
  ) {
    return;
  }

  const whatsappAgentId =
    s(
      batchData
        ?.whatsappAgentId
    );

  const conversationId =
    s(
      batchData
        ?.conversationId
    );

  const requesterAgentId =
    s(
      batchData
        ?.agentId
    );

  const sessionId =
    s(
      batchData
        ?.commissionAssistantSessionId
    );

  if (
    !whatsappAgentId ||
    !conversationId
  ) {
    return;
  }

  const claimed =
    await claimCommissionAssistantSummary({
      db,
      batchRef,
    });

  if (
    !claimed
  ) {
    return;
  }

  try {
    await sendWhatsAppConversationText({
      agentId:
        whatsappAgentId,

      conversationId,

      text:
        buildWhatsAppSummary({
          finalStatus,
          runs,
        }),

      sentBy:
        "commission_assistant",

      sentByName:
        "MagicSale עמלות",

      source:
        "commission_assistant",
    });

    await batchRef.set(
      {
        commissionAssistantSummarySentAt:
          nowTs(),

        commissionAssistantSummarySendingAt:
          null,

        commissionAssistantSummaryError:
          null,

        commissionAssistantBusinessFinishedAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    /*
     * סוגרים את ה-session אחרי שהסיכום נשלח.
     * כך הודעות WhatsApp עתידיות חוזרות ל-MagicTouch הרגיל,
     * ו"הרץ לי עמלות" יפתח session חדש.
     */
    if (
      requesterAgentId
    ) {
      const sessionRef =
        db.doc(
          `agents/${requesterAgentId}/commission_assistant_sessions/current`
        );

      const sessionSnap =
        await sessionRef.get();

      if (
        sessionSnap.exists
      ) {
        const sessionData =
          sessionSnap.data() as
            Record<
              string,
              any
            >;

        if (
          !sessionId ||
          s(
            sessionData
              ?.sessionId
          ) ===
            sessionId
        ) {
          await sessionRef.set(
            {
              state:
                "cancelled",

              cancelReason:
                "batch_completed",

              completedBatchId:
                batchId,

              completedBatchStatus:
                finalStatus,

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
        }
      }
    }
  } catch (
    error: any
  ) {
    await batchRef.set(
      {
        commissionAssistantSummarySendingAt:
          null,

        commissionAssistantSummaryError: {
          message:
            s(
              error?.message ||
              error
            ),

          failedAt:
            nowTs(),

          triggerRunId:
            runId,
        },

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    console.error(
      "[commissionAssistantBatchFinalizer] Failed to send WhatsApp summary",
      {
        batchId,
        runId,

        error:
          error?.message ||
          String(
            error
          ),
      }
    );
  }
}