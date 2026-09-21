/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  getCommissionAssistantMonthlyAvailability,
} from "./commissionAssistantMonthlyStatus";


function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function stringArray(
  value: unknown
): string[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value
    .map(
      (
        item
      ) =>
        s(
          item
        )
    )
    .filter(
      Boolean
    );
}

export type CommissionAssistantCompany = {
  id: string;
  name: string;
  companyAutomationClass: string;
  portalId: string;
  companyAutoDownloadEnabled: boolean;
  companyAutoDownloadMessage: string;
  allowEarlyDownload: boolean;
  requestedReportMonth?: string;
};

export type CommissionAutomationAvailability = {
  enabled: boolean;
  message: string;
};

export async function getCommissionAutomationAvailability(
  db: FirebaseFirestore.Firestore
): Promise<CommissionAutomationAvailability> {
  const snap =
    await db
      .doc(
        "systemFlags/automation"
      )
      .get();

  const data =
    snap.exists
      ? snap.data() as any
      : {};

  return {
    enabled:
      data?.autoDownloadEnabled !== false,

    message:
      s(
        data?.autoDownloadMessage
      ) ||
      "הדוחות עדיין לא זמינים להורדה החודש.",
  };
}

export async function getCommissionAssistantCompanies({
  db,
  requesterUserId,
  requesterAgentId,
  requesterUserData,
}: {
  db: FirebaseFirestore.Firestore;
  requesterUserId: string;
  requesterAgentId: string;
  requesterUserData: Record<string, any>;
}): Promise<CommissionAssistantCompany[]> {
  let preferredCompanyIds =
    stringArray(
      requesterUserData
        ?.preferredCompanyIds
    );

  if (
    requesterAgentId !==
      requesterUserId
  ) {
    const agentUserSnap =
      await db
        .collection(
          "users"
        )
        .doc(
          requesterAgentId
        )
        .get();

    if (
      agentUserSnap.exists
    ) {
      const agentPreferred =
        stringArray(
          agentUserSnap
            .data()
            ?.preferredCompanyIds
        );

      if (
        agentPreferred.length >
        0
      ) {
        preferredCompanyIds =
          agentPreferred;
      }
    }
  }

  const templatesSnap =
    await db
      .collection(
        "commissionTemplates"
      )
      .where(
        "isactive",
        "==",
        true
      )
      .get();

  const companyIds =
    Array.from(
      new Set(
        templatesSnap.docs
          .map(
            (
              doc
            ) =>
              s(
                doc.data()
                  ?.companyId
              )
          )
          .filter(
            Boolean
          )
      )
    );

  const companyEntries =
    await Promise.all(
      companyIds.map(
        async (
          companyId
        ) => {
          const snap =
            await db
              .collection(
                "company"
              )
              .doc(
                companyId
              )
              .get();

          return [
            companyId,
            snap.exists
              ? snap.data() as any
              : {},
          ] as const;
        }
      )
    );

  const companyMap =
    new Map(
      companyEntries
    );

  const result:
    CommissionAssistantCompany[] = [];

  for (
    const companyId of
    companyIds
  ) {
    if (
      preferredCompanyIds.length >
        0 &&
      !preferredCompanyIds.includes(
        companyId
      )
    ) {
      continue;
    }

    const companyInfo =
      companyMap.get(
        companyId
      ) ||
      {};

    const automationEnabled =
      companyInfo
        ?.automationEnabled === true;

    const companyAutomationClass =
      s(
        companyInfo
          ?.automationClass
      );

    if (
      !automationEnabled ||
      !companyAutomationClass
    ) {
      continue;
    }

    result.push({
      id:
        companyId,

      name:
        s(
          companyInfo
            ?.companyName
        ) ||
        companyId,

      companyAutomationClass,

      /*
       * חשוב: משחזרים כאן בדיוק את ההתנהגות של
       * ExcelCommissionImporter הקיים.
       *
       * ה-UI לא מעתיק companyInfo.portalId אל templateOptions,
       * ולכן ב-uniqueCompanies מתקבל בפועל:
       * portalId = t.portalId || t.companyId = companyId.
       *
       * לדוגמה מור:
       * company document id = "9"
       * companyInfo.portalId = "mor"
       * אבל ה-Bundle הקיים הוא bundle_9_commissions.
       *
       * לכן אין לקרוא כאן companyInfo.portalId.
       */
      portalId:
        companyId,

      companyAutoDownloadEnabled:
        companyInfo
          ?.autoDownloadEnabled !== false,

      companyAutoDownloadMessage:
        s(
          companyInfo
            ?.autoDownloadMessage
        ),

      allowEarlyDownload:
        companyInfo
          ?.allowEarlyDownload === true,
    });
  }

  const sortedCompanies =
    result.sort(
      (
        a,
        b
      ) =>
        a.name.localeCompare(
          b.name,
          "he"
        )
    );

  /*
   * חברות שכבר הושלמו לחודש הדוח הנוכחי לא מוצגות
   * לבחירה ב-WhatsApp. הבדיקה מבוססת על portalImportLocks
   * שה-Runner עצמו מסמן כ-done לאחר הצלחה.
   */
  const monthlyAvailability =
    await getCommissionAssistantMonthlyAvailability({
      db,
      requesterAgentId,
      companies:
        sortedCompanies,
    });

  return monthlyAvailability
    .availableCompanies;
}
