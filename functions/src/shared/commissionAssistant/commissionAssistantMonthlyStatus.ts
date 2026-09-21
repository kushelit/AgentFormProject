/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  CommissionAssistantCompany,
} from "./commissionAssistantCompanies";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

/*
 * זהה למשמעות של getCurrentPublicationYm ב-UI:
 * משתמשים בחודש הפרסום הנוכחי, לא ב-previous_month.
 *
 * ב-Backend מקבעים את אזור הזמן לישראל כדי שלא תהיה
 * סטייה במעבר חודש בגלל timezone של Cloud Functions.
 */
export function getCommissionAssistantPublicationYm(
  now:
    Date =
      new Date()
): string {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Jerusalem",

        year:
          "numeric",

        month:
          "2-digit",
      }
    ).formatToParts(
      now
    );

  const year =
    s(
      parts.find(
        (
          part
        ) =>
          part.type ===
          "year"
      )?.value
    );

  const month =
    s(
      parts.find(
        (
          part
        ) =>
          part.type ===
          "month"
      )?.value
    );

  if (
    !year ||
    !month
  ) {
    throw new Error(
      "COMMISSION_ASSISTANT_PUBLICATION_MONTH_RESOLUTION_FAILED"
    );
  }

  return `${year}-${month}`;
}

export function getCommissionAssistantBundleTemplateId(
  company:
    CommissionAssistantCompany
): string {
  const portalId =
    s(
      company.portalId
    ) ||
    company.id;

  return `bundle_${portalId}_commissions`;
}

function getLockId({
  requesterAgentId,
  templateId,
  ym,
}: {
  requesterAgentId:
    string;

  templateId:
    string;

  ym:
    string;
}): string {
  return `${requesterAgentId}_${templateId}_${ym}`;
}

export type CommissionAssistantDashboardStatus =
  | "done"
  | "running"
  | "error"
  | "ready"
  | "queued"
  | "disabled_by_flag";

export type CommissionAssistantMonthlyCompanyStatus = {
  company:
    CommissionAssistantCompany;

  uiStatus:
    CommissionAssistantDashboardStatus;

  ym:
    string;

  templateId:
    string;

  lockId:
    string;

  lockExists:
    boolean;

  lockState:
    string;

  lockRunId:
    string | null;

  runId:
    string | null;

  runStatus:
    string;

  runStep:
    string;

  errorMessage:
    string;
};

export type CommissionAssistantMonthlyAvailability = {
  reportYm:
    string;

  availableCompanies:
    CommissionAssistantCompany[];

  completedCompanies:
    CommissionAssistantCompany[];

  runningCompanies:
    CommissionAssistantCompany[];

  disabledCompanies:
    CommissionAssistantCompany[];

  errorCompanies:
    CommissionAssistantCompany[];

  statuses:
    CommissionAssistantMonthlyCompanyStatus[];
};

/*
 * העתקה של mapRunToUiStatus מתוך useAutomationDashboardStatus.
 *
 * ההבדל היחיד הוא ש-isAutoEnabledByFlag לא נכנס לפונקציה:
 * Commission Assistant בודק את systemFlags/automation לפני
 * שמגיעים לכאן. companyAutoDownloadEnabled כן נבדק כאן.
 */
function mapToUiStatus({
  runStatus,
  runStep,
  hasLock,
  lockState,
  isCompanyAutoEnabled,
}: {
  runStatus:
    string;

  runStep:
    string;

  hasLock:
    boolean;

  lockState:
    string;

  isCompanyAutoEnabled:
    boolean;
}): CommissionAssistantDashboardStatus {
  if (
    !isCompanyAutoEnabled
  ) {
    return "disabled_by_flag";
  }

  if (
    !hasLock &&
    !runStatus
  ) {
    return "ready";
  }

  if (
    runStatus ===
      "error" ||
    runStatus ===
      "failed" ||
    runStep ===
      "import_error" ||
    lockState ===
      "error"
  ) {
    return "error";
  }

  if (
    runStatus ===
      "success" &&
    runStep ===
      "import_done"
  ) {
    return "done";
  }

  if (
    runStatus ===
      "skipped"
  ) {
    if (
      runStep ===
        "duplicate_running"
    ) {
      return "running";
    }

    return "done";
  }

  if (
    lockState ===
      "running" ||
    runStatus ===
      "queued" ||
    runStatus ===
      "running" ||
    runStatus ===
      "otp_required" ||
    runStatus ===
      "logged_in" ||
    runStatus ===
      "file_uploaded" ||
    runStatus ===
      "done"
  ) {
    return "running";
  }

  if (
    lockState ===
      "done"
  ) {
    return "done";
  }

  return "ready";
}

export async function getCommissionAssistantMonthlyAvailability({
  db,
  requesterAgentId,
  companies,
}: {
  db:
    FirebaseFirestore.Firestore;

  requesterAgentId:
    string;

  companies:
    CommissionAssistantCompany[];
}): Promise<CommissionAssistantMonthlyAvailability> {
  const ym =
    getCommissionAssistantPublicationYm();

  const statuses =
    await Promise.all(
      companies.map(
        async (
          company
        ): Promise<CommissionAssistantMonthlyCompanyStatus> => {
          const templateId =
            getCommissionAssistantBundleTemplateId(
              company
            );

          const lockId =
            getLockId({
              requesterAgentId,
              templateId,
              ym,
            });

          const lockSnap =
            await db
              .doc(
                `portalImportLocks/${lockId}`
              )
              .get();

          let lockExists =
            false;

          let lockState =
            "";

          let lockRunId:
            string |
            null =
            null;

          let runId:
            string |
            null =
            null;

          let runStatus =
            "";

          let runStep =
            "";

          let errorMessage =
            "";

          if (
            lockSnap.exists
          ) {
            lockExists =
              true;

            const lockData =
              lockSnap.data() as
                Record<
                  string,
                  any
                >;

            lockState =
              s(
                lockData?.state
              );

            lockRunId =
              s(
                lockData?.runId
              ) ||
              null;
          }

          if (
            lockRunId
          ) {
            const runSnap =
              await db
                .doc(
                  `portalImportRuns/${lockRunId}`
                )
                .get();

            if (
              runSnap.exists
            ) {
              const runData =
                runSnap.data() as
                  Record<
                    string,
                    any
                  >;

              runId =
                s(
                  runData?.runId
                ) ||
                runSnap.id;

              runStatus =
                s(
                  runData?.status
                );

              runStep =
                s(
                  runData?.step
                );

              errorMessage =
                s(
                  runData
                    ?.error
                    ?.message
                );
            }
          }

          const uiStatus =
            mapToUiStatus({
              runStatus,
              runStep,
              hasLock:
                lockExists,
              lockState,
              isCompanyAutoEnabled:
                company
                  .companyAutoDownloadEnabled !==
                false,
            });

          return {
            company,
            uiStatus,
            ym,
            templateId,
            lockId,
            lockExists,
            lockState,
            lockRunId,
            runId,
            runStatus,
            runStep,
            errorMessage,
          };
        }
      )
    );

  /*
   * מבחינת בחירה להרצה:
   * ready + error = ניתנות להרצה.
   *
   * done = כבר בוצעה החודש.
   * running = כבר בתהליך.
   * disabled_by_flag = חסומה ברמת חברה.
   */
  const availableCompanies =
    statuses
      .filter(
        (
          status
        ) =>
          status.uiStatus ===
            "ready" ||
          status.uiStatus ===
            "error"
      )
      .map(
        (
          status
        ) =>
          status.company
      );

  return {
    reportYm:
      ym,

    availableCompanies,

    completedCompanies:
      statuses
        .filter(
          (
            status
          ) =>
            status.uiStatus ===
            "done"
        )
        .map(
          (
            status
          ) =>
            status.company
        ),

    runningCompanies:
      statuses
        .filter(
          (
            status
          ) =>
            status.uiStatus ===
            "running" ||
          status.uiStatus ===
            "queued"
        )
        .map(
          (
            status
          ) =>
            status.company
        ),

    disabledCompanies:
      statuses
        .filter(
          (
            status
          ) =>
            status.uiStatus ===
            "disabled_by_flag"
        )
        .map(
          (
            status
          ) =>
            status.company
        ),

    errorCompanies:
      statuses
        .filter(
          (
            status
          ) =>
            status.uiStatus ===
            "error"
        )
        .map(
          (
            status
          ) =>
            status.company
        ),

    statuses,
  };
}
