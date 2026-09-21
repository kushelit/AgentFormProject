/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  sendWhatsAppConversationText,
} from "../sendWhatsAppConversationText";

import {
  loadCommissionAssistantConfig,
  isCommissionAssistantTarget,
} from "./commissionAssistantConfig";

import type {
  CommissionAssistantConfig,
} from "./commissionAssistantConfig";

import {
  findCommissionAssistantRequesterByPhone,
  requireCommissionAssistantRequesterPermission,
} from "./commissionAssistantUserLookup";

import {
  getCommissionAutomationAvailability,
  getCommissionAssistantCompanies,
} from "./commissionAssistantCompanies";

import type {
  CommissionAssistantCompany,
} from "./commissionAssistantCompanies";

import {
  getCommissionAssistantSession,
  startCommissionAssistantSession,
  updateCommissionAssistantSession,
  cancelCommissionAssistantSession,
} from "./commissionAssistantSession";

import type {
  CommissionAssistantSession,
} from "./commissionAssistantSession";

import {
  sendCommissionAssistantCompanyFlow,
} from "./sendWhatsAppConversationFlow";

import {
  prepareCommissionAssistantRun,
} from "./commissionAssistantRuns";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizeText(
  value: unknown
): string {
  return s(
    value
  )
    .toLowerCase()
    .replace(
      /[\u05f3\u05f4'".,!?]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function isCommissionStartCommand(
  text: string
): boolean {
  const normalized =
    normalizeText(
      text
    );

  if (
    !normalized
  ) {
    return false;
  }

  if (
    normalized ===
      "עמלות"
  ) {
    return true;
  }

  if (
    !normalized.includes(
      "עמלות"
    )
  ) {
    return false;
  }

  return [
    "הרץ",
    "הרצה",
    "להריץ",
    "ריצה",
    "ריצת",
    "טעינ",
    "הפעל",
    "תפעיל",
    "התחל",
  ].some(
    (
      token
    ) =>
      normalized.includes(
        token
      )
  );
}

const HEB_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

function getIsraelPublicationYm(
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
      "COMMISSION_ASSISTANT_REPORT_MONTH_RESOLUTION_FAILED"
    );
  }

  return `${year}-${month}`;
}

function offsetYm(
  baseYm: string,
  monthsBack: number
): string {
  const [
    year,
    month,
  ] =
    baseYm
      .split(
        "-"
      )
      .map(
        Number
      );

  if (
    !year ||
    !month
  ) {
    throw new Error(
      "COMMISSION_ASSISTANT_INVALID_BASE_YM"
    );
  }

  const d =
    new Date(
      Date.UTC(
        year,
        month -
          1 -
          monthsBack,
        1
      )
    );

  return `${d.getUTCFullYear()}-${String(
    d.getUTCMonth() +
      1
  ).padStart(
    2,
    "0"
  )}`;
}

function labelFromYm(
  ym: string
): string {
  const [
    year,
    month,
  ] =
    ym.split(
      "-"
    );

  const index =
    Number(
      month
    ) -
    1;

  return `${HEB_MONTHS[index] || month} ${year}`;
}

function selectionSummary(
  companies: CommissionAssistantCompany[]
): string {
  return companies
    .map(
      (
        company
      ) => {
        const month =
          s(
            company
              .requestedReportMonth
          );

        return month
          ? `• ${company.name} — בגין ${labelFromYm(
              month
            )}`
          : `• ${company.name}`;
      }
    )
    .join(
      "\n"
    );
}

async function getEarlyDownloadOpen(
  db:
    FirebaseFirestore.Firestore
): Promise<boolean> {
  try {
    const snap =
      await db
        .doc(
          "portalRunnerConfig/global"
        )
        .get();

    return (
      snap.exists &&
      snap.data()
        ?.earlyDownloadOpen ===
        true
    );
  } catch {
    return false;
  }
}

function getPendingEarlyDownloadCompanies(
  companies:
    CommissionAssistantCompany[]
): CommissionAssistantCompany[] {
  return companies.filter(
    (
      company
    ) =>
      company.allowEarlyDownload ===
        true &&
      !s(
        company
          .requestedReportMonth
      )
  );
}

function manualCompanyList(
  companies: CommissionAssistantCompany[]
): string {
  return companies
    .map(
      (
        company,
        index
      ) =>
        `${index + 1}. ${company.name}`
    )
    .join(
      "\n"
    );
}

function parseManualSelection({
  text,
  companies,
}: {
  text: string;
  companies: CommissionAssistantCompany[];
}): CommissionAssistantCompany[] {
  const indexes =
    Array.from(
      new Set(
        (text.match(
          /\d+/g
        ) || [])
          .map(
            (
              value
            ) =>
              Number(
                value
              )
          )
          .filter(
            (
              value
            ) =>
              Number.isInteger(
                value
              ) &&
              value >= 1 &&
              value <=
                companies.length
          )
      )
    );

  return indexes.map(
    (
      index
    ) =>
      companies[
        index - 1
      ]
  );
}

function stringArray(
  value: unknown
): string[] {
  if (
    Array.isArray(
      value
    )
  ) {
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

  const normalized =
    s(
      value
    );

  if (
    !normalized
  ) {
    return [];
  }

  /*
   * הגנה למקרה שספק/SDK יחזיר את המערך כמחרוזת JSON.
   */
  try {
    const parsed =
      JSON.parse(
        normalized
      );

    if (
      Array.isArray(
        parsed
      )
    ) {
      return parsed
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
  } catch {
    // ממשיכים לפיצול טקסטואלי.
  }

  return normalized
    .split(
      /[,;\s]+/
    )
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

function parseCompanySelectionFlow({
  flowResponse,
  session,
}: {
  flowResponse: Record<string, any>;
  session: CommissionAssistantSession;
}): {
  matched: boolean;
  stale: boolean;
  selectedCompanies: CommissionAssistantCompany[];
} {
  const action =
    s(
      flowResponse?.action
    );

  if (
    action !==
      "commission_company_selection"
  ) {
    return {
      matched:
        false,
      stale:
        false,
      selectedCompanies:
        [],
    };
  }

  const responseSessionId =
    s(
      flowResponse?.sessionId
    ) ||
    s(
      flowResponse?.session_id
    ) ||
    s(
      flowResponse?.flow_token
    );

  if (
    !responseSessionId ||
    responseSessionId !==
      session.sessionId
  ) {
    return {
      matched:
        true,
      stale:
        true,
      selectedCompanies:
        [],
    };
  }

  const selectedCompanyIds =
    Array.from(
      new Set(
        stringArray(
          flowResponse
            ?.selectedCompanyIds ??
          flowResponse
            ?.selected_companies
        )
      )
    );

  const availableById =
    new Map(
      session
        .availableCompanies
        .map(
          (
            company
          ) => [
            company.id,
            company,
          ] as const
        )
    );

  const selectedCompanies =
    selectedCompanyIds
      .map(
        (
          companyId
        ) =>
          availableById.get(
            companyId
          ) ||
          null
      )
      .filter(
        (
          company
        ):
        company is CommissionAssistantCompany =>
          Boolean(
            company
          )
      );

  return {
    matched:
      true,
    stale:
      false,
    selectedCompanies,
  };
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
      "commission_assistant",
  });
}

async function sendReportMonthQuestion({
  whatsappAgentId,
  conversationId,
  company,
}: {
  whatsappAgentId:
    string;
  conversationId:
    string;
  company:
    CommissionAssistantCompany;
}): Promise<void> {
  const publicationYm =
    getIsraelPublicationYm();

  const ymMinus2 =
    offsetYm(
      publicationYm,
      2
    );

  const ymMinus1 =
    offsetYm(
      publicationYm,
      1
    );

  await sendAssistantMessage({
    whatsappAgentId,
    conversationId,

    text:
      `עבור ${company.name} ניתן לבחור חודש דיווח.\n\n` +
      `📅 ${labelFromYm(
        ymMinus2
      )} — ברירת המחדל\n` +
      `⚡ ${labelFromYm(
        ymMinus1
      )} — הורדה מוקדמת\n\n` +
      "איזה חודש להריץ?",

    buttons: [
      {
        id:
          `commission_report_month:${company.id}:${ymMinus2}`,
        title:
          labelFromYm(
            ymMinus2
          ),
      },
      {
        id:
          `commission_report_month:${company.id}:${ymMinus1}`,
        title:
          labelFromYm(
            ymMinus1
          ),
      },
      {
        id:
          "commission_cancel",
        title:
          "ביטול",
      },
    ],
  });
}

async function continueAfterCompanySelection({
  db,
  config,
  requesterAgentId,
  conversationId,
  selectedCompanies,
  selectionMethod,
}: {
  db:
    FirebaseFirestore.Firestore;
  config:
    CommissionAssistantConfig;
  requesterAgentId:
    string;
  conversationId:
    string;
  selectedCompanies:
    CommissionAssistantCompany[];
  selectionMethod:
    "all" |
    "whatsapp_flow" |
    "manual_text";
}): Promise<
  "choosing_report_months" |
  "confirming_selection"
> {
  const earlyDownloadOpen =
    await getEarlyDownloadOpen(
      db
    );

  const pending =
    earlyDownloadOpen
      ? getPendingEarlyDownloadCompanies(
          selectedCompanies
        )
      : [];

  if (
    pending.length >
      0
  ) {
    await updateCommissionAssistantSession({
      db,
      requesterAgentId,
      patch: {
        state:
          "choosing_report_months",

        selectedCompanies,

        selectionMethod,

        earlyDownloadOpen:
          true,
      },
    });

    await sendReportMonthQuestion({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,

      company:
        pending[0],
    });

    return "choosing_report_months";
  }

  await updateCommissionAssistantSession({
    db,
    requesterAgentId,
    patch: {
      state:
        "confirming_selection",

      selectedCompanies,

      selectionMethod,

      earlyDownloadOpen:
        false,
    },
  });

  await sendConfirmation({
    whatsappAgentId:
      config.whatsappAgentId,

    conversationId,

    companies:
      selectedCompanies,
  });

  return "confirming_selection";
}

function parseReportMonthAction(
  action: string
): {
  companyId:
    string;
  reportMonth:
    string;
} | null {
  const match =
    action.match(
      /^commission_report_month:([^:]+):(\d{4}-\d{2})$/
    );

  if (
    !match
  ) {
    return null;
  }

  return {
    companyId:
      s(
        match[1]
      ),

    reportMonth:
      s(
        match[2]
      ),
  };
}

async function sendModeQuestion({
  whatsappAgentId,
  conversationId,
}: {
  whatsappAgentId: string;
  conversationId: string;
}): Promise<void> {
  await sendAssistantMessage({
    whatsappAgentId,
    conversationId,

    text:
      "בשמחה 👌 איך תרצה לבחור את החברות לריצת העמלות?",

    buttons: [
      {
        id:
          "commission_all",
        title:
          "כל החברות",
      },
      {
        id:
          "commission_manual",
        title:
          "בחירה ידנית",
      },
      {
        id:
          "commission_cancel",
        title:
          "ביטול",
      },
    ],
  });
}

async function sendConfirmation({
  whatsappAgentId,
  conversationId,
  companies,
}: {
  whatsappAgentId: string;
  conversationId: string;
  companies: CommissionAssistantCompany[];
}): Promise<void> {
  await sendAssistantMessage({
    whatsappAgentId,
    conversationId,

    text:
      `בחרת ${companies.length} חברות:\n\n${selectionSummary(
        companies
      )}\n\nלאשר את הבחירה?`,

    buttons: [
      {
        id:
          "commission_confirm",
        title:
          "אישור",
      },
      {
        id:
          "commission_change",
        title:
          "שינוי",
      },
      {
        id:
          "commission_cancel",
        title:
          "ביטול",
      },
    ],
  });
}

function canUseCompanySelectionFlow(
  config: CommissionAssistantConfig
): boolean {
  return (
    config
      .companySelectionFlowEnabled &&
    Boolean(
      config
        .companySelectionFlowId
    ) &&
    Boolean(
      config
        .companySelectionScreenId
    )
  );
}

async function startManualCompanySelection({
  db,
  config,
  session,
  requesterAgentId,
  conversationId,
}: {
  db: FirebaseFirestore.Firestore;
  config: CommissionAssistantConfig;
  session: CommissionAssistantSession;
  requesterAgentId: string;
  conversationId: string;
}): Promise<
  "whatsapp_flow" |
  "manual_text"
> {
  if (
    session
      .availableCompanies
      .length <=
        20 &&
    canUseCompanySelectionFlow(
      config
    )
  ) {
    try {
      await updateCommissionAssistantSession({
        db,
        requesterAgentId,
        patch: {
          state:
            "choosing_companies",

          selectedCompanies:
            [],

          selectionMethod:
            "whatsapp_flow",
        },
      });

      await sendCommissionAssistantCompanyFlow({
        agentId:
          config.whatsappAgentId,

        conversationId,

        flowId:
          config.companySelectionFlowId,

        screenId:
          config.companySelectionScreenId,

        flowToken:
          session.sessionId,

        companies:
          session
            .availableCompanies
            .map(
              (
                company
              ) => ({
                id:
                  company.id,

                title:
                  company.name,
              })
            ),
      });

      return "whatsapp_flow";
    } catch (
      error: any
    ) {
      console.error(
        "[commissionAssistant] WhatsApp Flow send failed; falling back to manual text",
        {
          requesterAgentId,

          conversationId,

          error:
            error?.message ||
            String(
              error
            ),
        }
      );
    }
  }

  await updateCommissionAssistantSession({
    db,
    requesterAgentId,
    patch: {
      state:
        "choosing_companies",

      selectedCompanies:
        [],

      selectionMethod:
        "manual_text",
    },
  });

  await sendAssistantMessage({
    whatsappAgentId:
      config.whatsappAgentId,

    conversationId,

    text:
      `בחר את החברות לפי המספרים:\n\n${manualCompanyList(
        session.availableCompanies
      )}\n\nאפשר לענות למשל: 1,3,5`,
  });

  return "manual_text";
}

export type CommissionAssistantInboundResult = {
  handled: boolean;
  reason: string;
  requesterUserId?: string | null;
  requesterAgentId?: string | null;
};

export async function tryHandleCommissionAssistantInbound({
  db,
  whatsappAgentId,
  phoneNumberId,
  conversationId,
  phoneNormalized,
  messageText,
  quickReplyAction,
  flowResponse,
}: {
  db: FirebaseFirestore.Firestore;
  whatsappAgentId: string;
  phoneNumberId: string;
  conversationId: string;
  phoneNormalized: string;
  messageText?: string | null;
  messageType?: string | null;
  quickReplyAction?: string | null;
  flowResponse?: Record<string, any> | null;
  contactId?: string | null;
}): Promise<CommissionAssistantInboundResult> {
  const config =
    await loadCommissionAssistantConfig(
      db
    );

  if (
    !config ||
    !isCommissionAssistantTarget({
      config,
      whatsappAgentId,
      phoneNumberId,
    })
  ) {
    return {
      handled:
        false,
      reason:
        "not_commission_assistant_target",
    };
  }

  let requester;

  try {
    requester =
      await findCommissionAssistantRequesterByPhone({
        db,
        phoneNormalized,
      });
  } catch (
    error: any
  ) {
    const errorMessage =
      s(
        error?.message
      );

    if (
      errorMessage ===
        "COMMISSION_ASSISTANT_PHONE_AMBIGUOUS"
    ) {
      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          "מצאתי יותר ממשתמש MagicSale אחד עם מספר הטלפון הזה. לא ניתן להתחיל ריצת עמלות עד שהשיוך יתוקן.",
      });

      return {
        handled:
          true,
        reason:
          "requester_phone_ambiguous",
      };
    }

    if (
      errorMessage ===
        "COMMISSION_ASSISTANT_USER_INACTIVE"
    ) {
      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          "המשתמש המשויך למספר הזה אינו פעיל כרגע ב-MagicSale.",
      });

      return {
        handled:
          true,
        reason:
          "requester_inactive",
      };
    }

    throw error;
  }

  if (
    !requester
  ) {
    return {
      handled:
        false,
      reason:
        "sender_is_not_magicsale_user",
    };
  }

  const session =
    await getCommissionAssistantSession({
      db,

      requesterAgentId:
        requester.requesterAgentId,
    });

  const startCommand =
    isCommissionStartCommand(
      s(
        messageText
      )
    );

  if (
    !session &&
    !startCommand
  ) {
    return {
      handled:
        false,
      reason:
        "magicsale_user_without_commission_session",

      requesterUserId:
        requester.userId,

      requesterAgentId:
        requester.requesterAgentId,
    };
  }

  try {
    await requireCommissionAssistantRequesterPermission({
      db,
      requester,
      config,
    });
  } catch {
    await sendAssistantMessage({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,

      text:
        "אין למשתמש שלך הרשאה להפעלת טעינת העמלות האוטומטית.",
    });

    return {
      handled:
        true,
      reason:
        "permission_denied",

      requesterUserId:
        requester.userId,

      requesterAgentId:
        requester.requesterAgentId,
    };
  }

  if (
    startCommand
  ) {
    const availability =
      await getCommissionAutomationAvailability(
        db
      );

    if (
      !availability.enabled
    ) {
      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          availability.message,
      });

      return {
        handled:
          true,
        reason:
          "monthly_runs_not_released",

        requesterUserId:
          requester.userId,

        requesterAgentId:
          requester.requesterAgentId,
      };
    }

    const companies =
      await getCommissionAssistantCompanies({
        db,

        requesterUserId:
          requester.userId,

        requesterAgentId:
          requester.requesterAgentId,

        requesterUserData:
          requester.userData,
      });

    if (
      companies.length ===
        0
    ) {
      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          "לא מצאתי כרגע חברות עם אוטומציה זמינה למשתמש שלך.",
      });

      return {
        handled:
          true,
        reason:
          "no_available_companies",

        requesterUserId:
          requester.userId,

        requesterAgentId:
          requester.requesterAgentId,
      };
    }

    await startCommissionAssistantSession({
      db,

      requesterUserId:
        requester.userId,

      requesterAgentId:
        requester.requesterAgentId,

      requesterPhone:
        requester.phoneNormalized,

      requesterName:
        requester.displayName,

      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,

      availableCompanies:
        companies,
    });

    await sendModeQuestion({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,
    });

    return {
      handled:
        true,
      reason:
        "commission_session_started",

      requesterUserId:
        requester.userId,

      requesterAgentId:
        requester.requesterAgentId,
    };
  }

  if (
    !session
  ) {
    return {
      handled:
        false,
      reason:
        "commission_session_not_found",
    };
  }

  if (
    session.conversationId !==
      conversationId ||
    session.whatsappAgentId !==
      config.whatsappAgentId
  ) {
    return {
      handled:
        false,
      reason:
        "commission_session_belongs_to_other_conversation",
    };
  }

  const flowSelection =
    flowResponse
      ? parseCompanySelectionFlow({
          flowResponse,
          session,
        })
      : null;

  if (
    flowSelection
      ?.matched
  ) {
    if (
      flowSelection
        .stale
    ) {
      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          "הבחירה שהתקבלה שייכת לבקשה קודמת שכבר אינה פעילה. כתוב \"הרץ לי עמלות\" כדי להתחיל מחדש.",
      });

      return {
        handled:
          true,
        reason:
          "stale_company_selection_flow",
      };
    }

    if (
      session.state !==
        "choosing_companies"
    ) {
      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          "הבחירה התקבלה, אבל הבקשה כבר המשיכה לשלב אחר. אם תרצה לשנות אותה, לחץ על \"שינוי\".",
      });

      return {
        handled:
          true,
        reason:
          "company_selection_flow_wrong_state",
      };
    }

    if (
      flowSelection
        .selectedCompanies
        .length ===
        0
    ) {
      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          "לא התקבלה בחירת חברות תקינה. אפשר ללחוץ שוב על \"בחירה ידנית\" ולנסות מחדש.",
      });

      return {
        handled:
          true,
        reason:
          "company_selection_flow_empty",
      };
    }

    const nextState =
      await continueAfterCompanySelection({
        db,
        config,

        requesterAgentId:
          requester.requesterAgentId,

        conversationId,

        selectedCompanies:
          flowSelection
            .selectedCompanies,

        selectionMethod:
          "whatsapp_flow",
      });

    return {
      handled:
        true,
      reason:
        nextState ===
          "choosing_report_months"
          ? "company_selection_flow_waiting_for_report_month"
          : "company_selection_flow_resolved",

      requesterUserId:
        requester.userId,

      requesterAgentId:
        requester.requesterAgentId,
    };
  }

  const action =
    s(
      quickReplyAction
    );

  if (
    action ===
      "commission_cancel"
  ) {
    await cancelCommissionAssistantSession({
      db,

      requesterAgentId:
        requester.requesterAgentId,
    });

    await sendAssistantMessage({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,

      text:
        "ביטלתי את בקשת ריצת העמלות. אפשר להתחיל מחדש בכל רגע ולכתוב: הרץ לי עמלות.",
    });

    return {
      handled:
        true,
      reason:
        "commission_session_cancelled",
    };
  }

  if (
    session.state ===
      "choosing_mode"
  ) {
    if (
      action ===
        "commission_all"
    ) {
      const selectedCompanies =
        session.availableCompanies;

      const nextState =
        await continueAfterCompanySelection({
          db,
          config,

          requesterAgentId:
            requester.requesterAgentId,

          conversationId,

          selectedCompanies,

          selectionMethod:
            "all",
        });

      return {
        handled:
          true,
        reason:
          nextState ===
            "choosing_report_months"
            ? "all_companies_selected_waiting_for_report_month"
            : "all_companies_selected",
      };
    }

    if (
      action ===
        "commission_manual"
    ) {
      const selectionMethod =
        await startManualCompanySelection({
          db,
          config,
          session,

          requesterAgentId:
            requester.requesterAgentId,

          conversationId,
        });

      return {
        handled:
          true,

        reason:
          selectionMethod ===
            "whatsapp_flow"
            ? "whatsapp_company_flow_sent"
            : "manual_company_selection_fallback_started",
      };
    }

    await sendModeQuestion({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,
    });

    return {
      handled:
        true,
      reason:
        "choosing_mode_waiting_for_button",
    };
  }

  if (
    session.state ===
      "choosing_companies"
  ) {
    /*
     * אם ה-session נפתח דרך WhatsApp Flow, מלל חופשי לא אמור
     * לשמש כבחירה. רק nfm_reply של ה-Flow מתקבל.
     */
    if (
      session.selectionMethod ===
        "whatsapp_flow"
    ) {
      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          "מסך בחירת החברות עדיין פתוח. יש לבחור את החברות במסך וללחוץ \"אישור והרצת עמלות\".",
      });

      return {
        handled:
          true,
        reason:
          "waiting_for_whatsapp_flow_submission",
      };
    }

    const selectedCompanies =
      parseManualSelection({
        text:
          s(
            messageText
          ),

        companies:
          session.availableCompanies,
      });

    if (
      selectedCompanies.length ===
        0
    ) {
      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          `לא הצלחתי לזהות את הבחירה. שלח מספרים מתוך הרשימה, למשל 1,3,5:\n\n${manualCompanyList(
            session.availableCompanies
          )}`,
      });

      return {
        handled:
          true,
        reason:
          "manual_selection_not_resolved",
      };
    }

    const nextState =
      await continueAfterCompanySelection({
        db,
        config,

        requesterAgentId:
          requester.requesterAgentId,

        conversationId,

        selectedCompanies,

        selectionMethod:
          "manual_text",
      });

    return {
      handled:
        true,
      reason:
        nextState ===
          "choosing_report_months"
          ? "manual_selection_waiting_for_report_month"
          : "manual_selection_resolved",
    };
  }

  if (
    session.state ===
      "choosing_report_months"
  ) {
    const selectedCompanies =
      session.selectedCompanies ||
      [];

    const pending =
      getPendingEarlyDownloadCompanies(
        selectedCompanies
      );

    if (
      pending.length ===
        0
    ) {
      await updateCommissionAssistantSession({
        db,

        requesterAgentId:
          requester.requesterAgentId,

        patch: {
          state:
            "confirming_selection",
        },
      });

      await sendConfirmation({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        companies:
          selectedCompanies,
      });

      return {
        handled:
          true,
        reason:
          "report_month_selection_already_complete",
      };
    }

    const currentCompany =
      pending[0];

    const reportMonthAction =
      parseReportMonthAction(
        action
      );

    if (
      !reportMonthAction ||
      reportMonthAction.companyId !==
        currentCompany.id
    ) {
      await sendReportMonthQuestion({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        company:
          currentCompany,
      });

      return {
        handled:
          true,
        reason:
          "waiting_for_report_month_selection",
      };
    }

    const publicationYm =
      getIsraelPublicationYm();

    const allowedMonths =
      new Set([
        offsetYm(
          publicationYm,
          2
        ),
        offsetYm(
          publicationYm,
          1
        ),
      ]);

    if (
      !allowedMonths.has(
        reportMonthAction.reportMonth
      )
    ) {
      await sendReportMonthQuestion({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        company:
          currentCompany,
      });

      return {
        handled:
          true,
        reason:
          "invalid_report_month_selection",
      };
    }

    const updatedCompanies =
      selectedCompanies.map(
        (
          company
        ) =>
          company.id ===
            currentCompany.id
            ? {
                ...company,

                requestedReportMonth:
                  reportMonthAction.reportMonth,
              }
            : company
      );

    const nextPending =
      getPendingEarlyDownloadCompanies(
        updatedCompanies
      );

    if (
      nextPending.length >
        0
    ) {
      await updateCommissionAssistantSession({
        db,

        requesterAgentId:
          requester.requesterAgentId,

        patch: {
          selectedCompanies:
            updatedCompanies,
        },
      });

      await sendReportMonthQuestion({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        company:
          nextPending[0],
      });

      return {
        handled:
          true,
        reason:
          "report_month_selected_next_company",
      };
    }

    await updateCommissionAssistantSession({
      db,

      requesterAgentId:
        requester.requesterAgentId,

      patch: {
        state:
          "confirming_selection",

        selectedCompanies:
          updatedCompanies,
      },
    });

    await sendConfirmation({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,

      companies:
        updatedCompanies,
    });

    return {
      handled:
        true,
      reason:
        "report_month_selection_completed",
    };
  }

  if (
    session.state ===
      "confirming_selection"
  ) {
    if (
      action ===
        "commission_confirm"
    ) {
      const selectedCompanies =
        session.selectedCompanies ||
        [];

      if (
        selectedCompanies.length ===
          0
      ) {
        await sendAssistantMessage({
          whatsappAgentId:
            config.whatsappAgentId,

          conversationId,

          text:
            "לא מצאתי חברות שנבחרו להרצה. כתוב \"הרץ לי עמלות\" כדי להתחיל מחדש.",
        });

        return {
          handled:
            true,
          reason:
            "confirmed_without_selected_companies",
        };
      }

      const preparation =
        await prepareCommissionAssistantRun({
          db,

          requesterAgentId:
            requester.requesterAgentId,

          whatsappAgentId:
            config.whatsappAgentId,

          conversationId,

          sessionId:
            session.sessionId,

          selectedCompanies,
        });

      if (
        preparation.state ===
          "nothing_to_run"
      ) {
        await updateCommissionAssistantSession({
          db,

          requesterAgentId:
            requester.requesterAgentId,

          patch: {
            state:
              "cancelled",

            cancelReason:
              "monthly_run_already_completed",

            reportYm:
              preparation.reportYm,

            updatedAt:
              new Date(),
          },
        });

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

        await sendAssistantMessage({
          whatsappAgentId:
            config.whatsappAgentId,

          conversationId,

          text:
            `אין כרגע חברה חדשה להרצה עבור חודש הדוח ${preparation.reportYm}.` +
            (
              details
                ? `\n\n${details}`
                : ""
            ) +
            "\n\nאם תרצה להתחיל בחירה חדשה, כתוב \"הרץ לי עמלות\".",
        });

        return {
          handled:
            true,
          reason:
            "monthly_run_nothing_to_run",
        };
      }

      if (
        preparation.state ===
          "runner_offline"
      ) {
        await updateCommissionAssistantSession({
          db,

          requesterAgentId:
            requester.requesterAgentId,

          patch: {
            state:
              "waiting_runner",

            confirmedAt:
              new Date(),
          },
        });

        await sendAssistantMessage({
          whatsappAgentId:
            config.whatsappAgentId,

          conversationId,

          text:
            "הבחירה אושרה ✅\n\nכרגע ה-Runner לא מחובר מהמחשב שלך. אם המחשב פתוח, ה-Watchdog אמור להפעיל אותו אוטומטית. אפשר להמתין מעט ואז ללחוץ \"בדוק שוב\".",

          buttons: [
            {
              id:
                "commission_retry_runner",
              title:
                "בדוק שוב",
            },
            {
              id:
                "commission_change",
              title:
                "שינוי",
            },
            {
              id:
                "commission_cancel",
              title:
                "ביטול",
            },
          ],
        });

        return {
          handled:
            true,
          reason:
            "runner_offline_waiting",
        };
      }

      if (
        preparation.state ===
          "runner_update_unavailable"
      ) {
        await updateCommissionAssistantSession({
          db,

          requesterAgentId:
            requester.requesterAgentId,

          patch: {
            state:
              "waiting_runner",

            confirmedAt:
              new Date(),
          },
        });

        await sendAssistantMessage({
          whatsappAgentId:
            config.whatsappAgentId,

          conversationId,

          text:
            `ה-Runner מחובר, אבל נדרשת גרסה ${preparation.latestVersion || "חדשה יותר"} ולא מוגדר installerUrl לעדכון אוטומטי. יש לעדכן את הגרסה ואז ללחוץ \"בדוק שוב\".`,

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

        return {
          handled:
            true,
          reason:
            "runner_update_unavailable",
        };
      }

      if (
        preparation.state ===
          "runner_updating"
      ) {
        await updateCommissionAssistantSession({
          db,

          requesterAgentId:
            requester.requesterAgentId,

          patch: {
            state:
              "updating_runner",

            updateRunId:
              preparation.updateRunId,

            confirmedAt:
              new Date(),
          },
        });

        await sendAssistantMessage({
          whatsappAgentId:
            config.whatsappAgentId,

          conversationId,

          text:
            `מצאתי שה-Runner בגרסה ${preparation.currentVersion || "לא ידועה"}, והגרסה העדכנית היא ${preparation.latestVersion}. שלחתי לו עדכון אוטומטי.\n\nאין צורך לעשות דבר — כשה-Runner יחזור בגרסה החדשה, ריצת העמלות תתחיל אוטומטית. הכפתור "בדוק שוב" נשאר רק כאפשרות בדיקה ידנית במקרה הצורך.`,

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

        return {
          handled:
            true,
          reason:
            "runner_update_started",
        };
      }

      await updateCommissionAssistantSession({
        db,

        requesterAgentId:
          requester.requesterAgentId,

        patch: {
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

          confirmedAt:
            new Date(),

          batchCreatedAt:
            new Date(),
        },
      });

      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text: (() => {
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

          const skippedLines = [
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

          const suffix =
            skippedLines.length >
              0
              ? `\n\n${skippedLines.join("\n")}`
              : "";

          return preparation.alreadyExisted
            ? `הריצה כבר נשלחה ל-Runner ✅\n${preparation.runIds.length} חברות נמצאות ב-Batch הקיים.${suffix}`
            : `הריצה יצאה לדרך ✅\n\nנוצר Batch עם ${preparation.runIds.length} חברות והוא נשלח ל-Runner במחשב שלך. החברות ירוצו אחת אחרי השנייה.${suffix}`;
        })(),
      });

      return {
        handled:
          true,
        reason:
          preparation.alreadyExisted
            ? "commission_batch_already_created"
            : "commission_batch_created",
      };
    }

    if (
      action ===
        "commission_change"
    ) {
      await updateCommissionAssistantSession({
        db,

        requesterAgentId:
          requester.requesterAgentId,

        patch: {
          state:
            "choosing_mode",

          selectedCompanies:
            [],

          selectionMethod:
            null,
        },
      });

      await sendModeQuestion({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,
      });

      return {
        handled:
          true,
        reason:
          "selection_change_requested",
      };
    }

    await sendConfirmation({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,

      companies:
        session.selectedCompanies,
    });

    return {
      handled:
        true,
      reason:
        "confirmation_waiting_for_button",
    };
  }

  if (
    session.state ===
      "waiting_runner" ||
    session.state ===
      "updating_runner" ||
    session.state ===
      "ready"
  ) {
    if (
      action ===
        "commission_change"
    ) {
      await updateCommissionAssistantSession({
        db,

        requesterAgentId:
          requester.requesterAgentId,

        patch: {
          state:
            "choosing_mode",

          selectedCompanies:
            [],

          selectionMethod:
            null,
        },
      });

      await sendModeQuestion({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,
      });

      return {
        handled:
          true,
        reason:
          "selection_change_requested_while_waiting_runner",
      };
    }

    if (
      action !==
        "commission_retry_runner"
    ) {
      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          "הבחירה שמורה. לחץ \"בדוק שוב\" כדי לבדוק אם ה-Runner מוכן ולהתחיל את הריצה.",

        buttons: [
          {
            id:
              "commission_retry_runner",
            title:
              "בדוק שוב",
          },
          {
            id:
              "commission_change",
            title:
              "שינוי",
          },
          {
            id:
              "commission_cancel",
            title:
              "ביטול",
          },
        ],
      });

      return {
        handled:
          true,
        reason:
          "waiting_for_runner_retry",
      };
    }

    const preparation =
      await prepareCommissionAssistantRun({
        db,

        requesterAgentId:
          requester.requesterAgentId,

        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        sessionId:
          session.sessionId,

        selectedCompanies:
          session.selectedCompanies,
      });

    if (
      preparation.state ===
        "nothing_to_run"
    ) {
      await updateCommissionAssistantSession({
        db,

        requesterAgentId:
          requester.requesterAgentId,

        patch: {
          state:
            "cancelled",

          cancelReason:
            "monthly_run_already_completed",

          reportYm:
            preparation.reportYm,

          updatedAt:
            new Date(),
        },
      });

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

      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          `אין כרגע חברה חדשה להרצה עבור חודש הדוח ${preparation.reportYm}.` +
          (
            details
              ? `\n\n${details}`
              : ""
          ) +
          "\n\nאם תרצה להתחיל בחירה חדשה, כתוב \"הרץ לי עמלות\".",
      });

      return {
        handled:
          true,
        reason:
          "monthly_run_nothing_to_run",
      };
    }

    if (
      preparation.state ===
        "runner_offline"
    ) {
      await updateCommissionAssistantSession({
        db,

        requesterAgentId:
          requester.requesterAgentId,

        patch: {
          state:
            "waiting_runner",
        },
      });

      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          "ה-Runner עדיין לא מחובר. ודא שהמחשב פתוח, המתן מעט ולחץ שוב על \"בדוק שוב\".",

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

      return {
        handled:
          true,
        reason:
          "runner_still_offline",
      };
    }

    if (
      preparation.state ===
        "runner_update_unavailable"
    ) {
      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          "ה-Runner מחובר אבל עדיין לא בגרסה הנדרשת, ואין כרגע קובץ עדכון אוטומטי זמין.",

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

      return {
        handled:
          true,
        reason:
          "runner_update_still_unavailable",
      };
    }

    if (
      preparation.state ===
        "runner_updating"
    ) {
      await updateCommissionAssistantSession({
        db,

        requesterAgentId:
          requester.requesterAgentId,

        patch: {
          state:
            "updating_runner",

          updateRunId:
            preparation.updateRunId,
        },
      });

      await sendAssistantMessage({
        whatsappAgentId:
          config.whatsappAgentId,

        conversationId,

        text:
          `העדכון עדיין מתבצע. יעד: ${preparation.latestVersion}.\n\nכשה-Runner יחזור לפעילות בגרסה החדשה, ריצת העמלות תתחיל אוטומטית. אין צורך לבצע פעולה נוספת.`,

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

      return {
        handled:
          true,
        reason:
          "runner_still_updating",
      };
    }

    await updateCommissionAssistantSession({
      db,

      requesterAgentId:
        requester.requesterAgentId,

      patch: {
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
      },
    });

    await sendAssistantMessage({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,

      text: (() => {
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

        const skippedLines = [
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

        const suffix =
          skippedLines.length >
            0
            ? `\n\n${skippedLines.join("\n")}`
            : "";

        return preparation.alreadyExisted
          ? `הריצה כבר קיימת ונשלחה ל-Runner ✅${suffix}`
          : `ה-Runner מוכן ✅\nנוצר Batch עם ${preparation.runIds.length} חברות והריצה יצאה לדרך.${suffix}`;
      })(),
    });

    return {
      handled:
        true,
      reason:
        preparation.alreadyExisted
          ? "commission_batch_already_created_after_retry"
          : "commission_batch_created_after_retry",
    };
  }

  if (
    session.state ===
      "batch_created"
  ) {
    await sendAssistantMessage({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,

      text:
        `ריצת העמלות כבר נשלחה ל-Runner ✅${s((session as any)?.batchId) ? `\nBatch: ${s((session as any).batchId)}` : ""}`,
    });

    return {
      handled:
        true,
      reason:
        "commission_batch_already_active",
    };
  }

  return {
    handled:
      false,
    reason:
      "commission_state_not_handled",
  };
}
