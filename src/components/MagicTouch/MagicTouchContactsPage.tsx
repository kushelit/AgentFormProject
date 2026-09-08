"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  useSearchParams,
} from "next/navigation";

import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

import {
  getAgentSurenseConfig,
} from "@/lib/MagicTouch/integrations/surense/api";

import {
  useMagicTouchAgent,
} from "@/components/MagicTouch/MagicTouchAgentContext";

import CreateMagicTouchContactModal from "@/components/MagicTouch/CreateMagicTouchContactModal";
import ImportMagicTouchExcelModal from "@/components/MagicTouch/ImportMagicTouchExcelModal";
import SendMagicTouchCampaignModal, {
  type MagicTouchCampaignSummary,
} from "@/components/MagicTouch/SendMagicTouchCampaignModal";

type SourceSystem =
  | "surense"
  | "magicsale"
  | "excel"
  | "manual"
  | "external_crm"
  | "other";

type MagicTouchCampaignStatus = {
  campaignId?: string | null;
  campaignSource?: string | null;

  templateName?: string | null;
  templateLanguage?: string | null;

  status?: string | null;

  waMessageId?: string | null;
  conversationId?: string | null;

  sentAt?: number | null;
  sentConfirmedAt?: number | null;
  deliveredAt?: number | null;
  readAt?: number | null;
  repliedAt?: number | null;
  failedAt?: number | null;

  replyCount?: number | null;
  replyText?: string | null;

  failureCode?: string | number | null;
  failureReason?: string | null;

  createdBy?: string | null;
  updatedAt?: number | null;
};

type MagicTouchContact = {
  id: string;
  contactId: string;
  agentId: string;

  fullName: string;
  firstName: string;
  lastName: string;

  phone: string;
  phoneNormalized: string;

  email: string | null;
  emailNormalized: string | null;

  idNumber: string | null;
  gender: string | null;
  birthDate: string | null;

  sourceSystem: SourceSystem;

  sourceRecordId: string | null;

  sourceData?: {
    surense?: {
      customerId: string | null;
      workflowId: string | null;
      statusName: string | null;
      statusActive: boolean | null;
      lastActivityDate: string | null;
    } | null;

    magicsale?: {
      customerDocId: string | null;
      customerId: string | null;
    } | null;

    excel?: {
      importId?: string | null;
      importRunId?: string | null;
      fileName: string | null;
      rowNumber?: number | null;
      uploadedBy?: string | null;
    } | null;
  };

  engagement?: {
    reengagement?: {
      status?: string | null;
      interestStatus?: string | null;
      interestRespondedAt?: number | null;

      bookingStatus?: string | null;
      bookingLink?: string | null;
      bookingLinkSentAt?: number | null;
      bookedAt?: number | null;

      powerOfAttorney?: {
        status?: string | null;
        requestedAt?: number | null;
        lastCheckedAt?: number | null;
        signedAt?: number | null;
        reminderDue?: boolean;
      } | null;

      resolvedAt?: number | null;
      lastFlowRunId?: string | null;
      surenseSyncStatus?: string | null;
      surenseSyncedAt?: number | null;
      updatedAt?: number | null;
    } | null;

    campaigns?: Record<
      string,
      MagicTouchCampaignStatus
    > | null;
  } | null;

  contactStatus: string;
  interestStatus: string;
  appointmentStatus: string;
  appointmentProvider: string | null;
  consentStatus: string;

  tags: string[];

  notes: string | null;

  lastInboundAt: number | null;
  lastOutboundAt: number | null;
  lastReplyText: string | null;
  sourceLastSyncedAt: number | null;

  createdAt: number | null;
  updatedAt: number | null;
};

type MagicTouchStats = {
  total: number;

  bySource: Record<
    string,
    number
  >;

  byContactStatus: Record<
    string,
    number
  >;

  byInterestStatus: Record<
    string,
    number
  >;

  byAppointmentStatus: Record<
    string,
    number
  >;

  withPhone: number;
  withoutPhone: number;
  withEmail: number;
  withoutEmail: number;
};

type GetMagicTouchContactsResponse = {
  ok: boolean;
  agentId: string;
  contacts: MagicTouchContact[];
  stats: MagicTouchStats;
  count: number;
  limit: number;
};

type UpdateMagicTouchContactDetailsResponse = {
  ok: boolean;
  agentId: string;
  contactId: string;
  phone: string;
  phoneNormalized: string;
  email: string | null;
  emailNormalized: string | null;
};

type CampaignOption = {
  key: string;
  campaignId: string;
  label: string;
  templateName: string;
  status: string;
};

type GetMagicTouchCampaignsResponse = {
  ok: boolean;
  agentId: string;
  campaigns: MagicTouchCampaignSummary[];
  count: number;
};

function formatDate(
  value:
    number | null
): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "he-IL",
    {
      dateStyle:
        "short",

      timeStyle:
        "short",
    }
  ).format(
    new Date(
      value
    )
  );
}

function sourceLabel(
  source:
    string
): string {
  switch (
    source
  ) {
    case "surense":
      return "שורנס";

    case "magicsale":
      return "MagicSale";

    case "excel":
      return "Excel";

    case "manual":
      return "ידני";

    case "external_crm":
      return "CRM חיצוני";

    default:
      return "אחר";
  }
}

function interestLabel(
  status:
    string
): string {
  switch (
    status
  ) {
    case "interested":
      return "מעוניין";

    case "not_interested":
      return "לא מעוניין";

    case "pending":
      return "ממתין לתגובה";

    case "no_response":
      return "ללא תגובה";

    default:
      return "טרם נוצר קשר";
  }
}

function appointmentLabel(
  status:
    string
): string {
  switch (
    status
  ) {
    case "link_sent":
      return "נשלח קישור";

    case "booked":
      return "נקבעה פגישה";

    case "cancelled":
      return "הפגישה בוטלה";

    case "no_booking":
      return "לא נקבעה";

    case "not_required":
      return "לא נדרש";

    default:
      return "טרם נשלח";
  }
}

function powerOfAttorneyLabel(
  status:
    string
): string {
  switch (
    status
  ) {
    case "waiting_for_signature":
      return "ממתין לחתימה";

    case "partially_signed":
      return "חתום חלקית";

    case "signed":
      return "נחתם";

    case "failed":
      return "נכשל";

    case "cancelled":
      return "בוטל";

    default:
      return "לא נשלח";
  }
}

function campaignStatusLabel(
  status:
    string
): string {
  switch (
    status
  ) {
    case "sent":
      return "נשלח";

    case "accepted":
      return "נשלח";

    case "delivered":
      return "נמסר";

    case "read":
      return "נקרא";

    case "replied":
      return "הגיב";

    case "failed":
      return "נכשל";

    default:
      return status
        ? status
        : "טרם נשלח";
  }
}

function campaignStatusClassName(
  status:
    string
): string {
  switch (
    status
  ) {
    case "replied":
      return "bg-violet-100 text-violet-700";

    case "read":
      return "bg-emerald-100 text-emerald-700";

    case "delivered":
      return "bg-blue-100 text-blue-700";

    case "sent":
    case "accepted":
      return "bg-sky-100 text-sky-700";

    case "failed":
      return "bg-rose-100 text-rose-700";

    default:
      return "bg-slate-100 text-slate-600";
  }
}

function getContactInterestStatus(
  contact:
    MagicTouchContact
): string {
  return (
    contact
      .engagement
      ?.reengagement
      ?.interestStatus ||
    contact
      .interestStatus ||
    ""
  );
}

function getContactAppointmentStatus(
  contact:
    MagicTouchContact
): string {
  return (
    contact
      .engagement
      ?.reengagement
      ?.bookingStatus ||
    contact
      .appointmentStatus ||
    ""
  );
}

function getCampaigns(
  contact:
    MagicTouchContact
): Record<
  string,
  MagicTouchCampaignStatus
> {
  const campaigns =
    contact
      .engagement
      ?.campaigns;

  if (
    !campaigns ||
    typeof campaigns !==
      "object" ||
    Array.isArray(
      campaigns
    )
  ) {
    return {};
  }

  return campaigns;
}

function getCampaignById(
  contact:
    MagicTouchContact,
  campaignId:
    string
): MagicTouchCampaignStatus | null {
  const campaigns =
    getCampaigns(
      contact
    );

  for (
    const [
      key,
      campaign,
    ] of Object.entries(
      campaigns
    )
  ) {
    const currentCampaignId =
      String(
        campaign
          ?.campaignId ||
        key
      ).trim();

    if (
      currentCampaignId ===
      campaignId
    ) {
      return campaign;
    }
  }

  return null;
}

function getLatestCampaign(
  contact:
    MagicTouchContact
): {
  key: string;
  campaign: MagicTouchCampaignStatus;
} | null {
  const entries =
    Object.entries(
      getCampaigns(
        contact
      )
    );

  if (
    entries.length ===
    0
  ) {
    return null;
  }

  const sorted =
    entries.sort(
      (
        [
          ,
          left,
        ],
        [
          ,
          right,
        ]
      ) => {
        const leftDate =
          Number(
            left
              ?.updatedAt ||
            left
              ?.repliedAt ||
            left
              ?.readAt ||
            left
              ?.deliveredAt ||
            left
              ?.sentAt ||
            0
          );

        const rightDate =
          Number(
            right
              ?.updatedAt ||
            right
              ?.repliedAt ||
            right
              ?.readAt ||
            right
              ?.deliveredAt ||
            right
              ?.sentAt ||
            0
          );

        return (
          rightDate -
          leftDate
        );
      }
    );

  const [
    key,
    campaign,
  ] =
    sorted[0];

  return {
    key,
    campaign,
  };
}

export default function MagicTouchContactsPage() {
  const {
    selectedAgentId,
  } =
    useMagicTouchAgent();

  const agentId =
    selectedAgentId;

  const searchParams =
    useSearchParams();

  const dashboardCampaignId =
    String(
      searchParams.get(
        "campaignId"
      ) ||
      ""
    ).trim();

  const dashboardCampaignStatus =
    String(
      searchParams.get(
        "campaignStatus"
      ) ||
      ""
    ).trim();

  const [
    hasSurenseIntegration,
    setHasSurenseIntegration,
  ] =
    useState(false);

  const [
    contacts,
    setContacts,
  ] =
    useState<
      MagicTouchContact[]
    >([]);

  const [
    campaignCatalog,
    setCampaignCatalog,
  ] =
    useState<
      MagicTouchCampaignSummary[]
    >([]);

  const [
    stats,
    setStats,
  ] =
    useState<
      MagicTouchStats | null
    >(null);

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    sourceFilter,
    setSourceFilter,
  ] =
    useState("");

  const [
    campaignFilter,
    setCampaignFilter,
  ] =
    useState("");

  const [
    campaignStatusFilter,
    setCampaignStatusFilter,
  ] =
    useState("");

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");

  const [
    isCreateModalOpen,
    setIsCreateModalOpen,
  ] =
    useState(false);

  const [
    isExcelImportOpen,
    setIsExcelImportOpen,
  ] =
    useState(false);

  const [
    isCampaignModalOpen,
    setIsCampaignModalOpen,
  ] =
    useState(false);

  const [
    editingContact,
    setEditingContact,
  ] =
    useState<
      MagicTouchContact | null
    >(null);

  const [
    editPhone,
    setEditPhone,
  ] =
    useState("");

  const [
    editEmail,
    setEditEmail,
  ] =
    useState("");

  const [
    isSavingContact,
    setIsSavingContact,
  ] =
    useState(false);

  const [
    selectedContactIds,
    setSelectedContactIds,
  ] =
    useState<
      Set<string>
    >(
      new Set()
    );

  const loadContacts =
    useCallback(
      async () => {
        if (!agentId) {
          setContacts([]);
          setStats(null);
          setIsLoading(false);
          return;
        }

        setIsLoading(true);
        setErrorMessage("");

        try {
          const fn =
            httpsCallable<
              {
                agentId:
                  string;

                limit:
                  number;
              },
              GetMagicTouchContactsResponse
            >(
              functions,
              "getMagicTouchContacts"
            );

          const result =
            await fn({
              agentId,

              limit:
                500,
            });

          const data =
            result.data;

          setContacts(
            Array.isArray(
              data?.contacts
            )
              ? data.contacts
              : []
          );

          setStats(
            data?.stats ||
              null
          );
        } catch (
          error: any
        ) {
          console.error(
            "[MagicTouchContactsPage] Failed to load contacts",
            error
          );

          setContacts([]);
          setStats(null);

          setErrorMessage(
            error?.message ||
              "לא ניתן היה לטעון את אנשי הקשר."
          );
        } finally {
          setIsLoading(false);
        }
      },
      [
        agentId,
      ]
    );

  const loadCampaigns =
    useCallback(
      async () => {
        if (!agentId) {
          setCampaignCatalog([]);
          return;
        }

        try {
          const fn =
            httpsCallable<
              {
                agentId: string;
              },
              GetMagicTouchCampaignsResponse
            >(
              functions,
              "getMagicTouchCampaigns"
            );

          const result =
            await fn({
              agentId,
            });

          setCampaignCatalog(
            Array.isArray(
              result.data?.campaigns
            )
              ? result.data.campaigns
              : []
          );
        } catch (
          error: any
        ) {
          console.error(
            "[MagicTouchContactsPage] Failed to load campaigns",
            error
          );

          setCampaignCatalog([]);
        }
      },
      [
        agentId,
      ]
    );

  useEffect(() => {
    if (!agentId) {
      setHasSurenseIntegration(false);
      return;
    }

    const loadSurenseConfig =
      async () => {
        try {
          const result =
            await getAgentSurenseConfig(
              agentId
            );

          setHasSurenseIntegration(
            result.config.enabled ===
              true
          );
        } catch (
          error
        ) {
          console.error(
            "[MagicTouchContactsPage] Failed to load Surense config",
            error
          );

          setHasSurenseIntegration(
            false
          );
        }
      };

    void loadSurenseConfig();
  }, [
    agentId,
  ]);

  useEffect(() => {
    void Promise.all([
      loadContacts(),
      loadCampaigns(),
    ]);
  }, [
    loadCampaigns,
    loadContacts,
  ]);

  useEffect(() => {
    setSelectedContactIds(
      new Set()
    );

    setIsCampaignModalOpen(
      false
    );

    setEditingContact(
      null
    );

    setEditPhone(
      ""
    );

    setEditEmail(
      ""
    );

    setCampaignCatalog(
      []
    );

    setCampaignFilter(
      ""
    );

    setCampaignStatusFilter(
      ""
    );
  }, [
    agentId,
  ]);

  useEffect(() => {
    if (
      !agentId ||
      !dashboardCampaignId
    ) {
      return;
    }

    setCampaignFilter(
      dashboardCampaignId
    );

    setCampaignStatusFilter(
      dashboardCampaignStatus
    );
  }, [
    agentId,
    dashboardCampaignId,
    dashboardCampaignStatus,
  ]);

  const campaignOptions =
    useMemo<
      CampaignOption[]
    >(
      () => {
        const map =
          new Map<
            string,
            CampaignOption
          >();

        for (
          const campaign of
          campaignCatalog
        ) {
          const campaignId =
            String(
              campaign.campaignId ||
              ""
            ).trim();

          if (!campaignId) {
            continue;
          }

          map.set(
            campaignId,
            {
              key:
                campaignId,
              campaignId,
              label:
                String(
                  campaign.name ||
                  campaign.templateName ||
                  campaignId
                ).trim(),
              templateName:
                String(
                  campaign.templateName ||
                  ""
                ).trim(),
              status:
                String(
                  campaign.status ||
                  ""
                ).trim(),
            }
          );
        }

        /*
         * תאימות לקמפיינים ישנים: אם קיימת רשומת קמפיין
         * אצל איש קשר אך מסמך הקמפיין לא נטען/לא קיים,
         * עדיין נציג אותה במסנן ולא נאבד היסטוריה.
         */
        for (
          const contact of
          contacts
        ) {
          const campaigns =
            getCampaigns(
              contact
            );

          for (
            const [
              key,
              campaign,
            ] of Object.entries(
              campaigns
            )
          ) {
            const campaignId =
              String(
                campaign
                  ?.campaignId ||
                key
              ).trim();

            if (
              !campaignId ||
              map.has(
                campaignId
              )
            ) {
              continue;
            }

            const templateName =
              String(
                campaign
                  ?.templateName ||
                ""
              ).trim();

            map.set(
              campaignId,
              {
                key,
                campaignId,
                label:
                  templateName ||
                  campaignId,
                templateName,
                status:
                  "legacy",
              }
            );
          }
        }

        return Array.from(
          map.values()
        ).sort(
          (
            left,
            right
          ) =>
            left.label.localeCompare(
              right.label,
              "he"
            )
        );
      },
      [
        campaignCatalog,
        contacts,
      ]
    );

  const filteredContacts =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      return contacts.filter(
        (
          contact
        ) => {
          if (
            sourceFilter &&
            contact.sourceSystem !==
              sourceFilter
          ) {
            return false;
          }

          if (
            campaignFilter
          ) {
            const campaign =
              getCampaignById(
                contact,
                campaignFilter
              );

            if (
              campaignStatusFilter ===
              "not_sent"
            ) {
              if (
                campaign
              ) {
                return false;
              }
            } else {
              if (
                !campaign
              ) {
                return false;
              }

              const status =
                String(
                  campaign.status ||
                  ""
                ).trim();

              if (
                campaignStatusFilter ===
                "already_sent"
              ) {
                if (
                  ![
                    "accepted",
                    "sent",
                    "delivered",
                    "read",
                    "replied",
                  ].includes(
                    status
                  )
                ) {
                  return false;
                }
              } else if (
                campaignStatusFilter ===
                "delivered"
              ) {
                if (
                  ![
                    "delivered",
                    "read",
                    "replied",
                  ].includes(
                    status
                  )
                ) {
                  return false;
                }
              } else if (
                campaignStatusFilter ===
                "read"
              ) {
                if (
                  ![
                    "read",
                    "replied",
                  ].includes(
                    status
                  )
                ) {
                  return false;
                }
              } else if (
                campaignStatusFilter &&
                status !==
                  campaignStatusFilter
              ) {
                return false;
              }
            }
          }

          if (
            !normalizedSearch
          ) {
            return true;
          }

          const values =
            [
              contact.fullName,
              contact.phone,
              contact.phoneNormalized,
              contact.email ||
                "",
              contact.idNumber ||
                "",
              contact.sourceRecordId ||
                "",
            ];

          return values.some(
            (
              value
            ) =>
              String(
                value
              )
                .toLowerCase()
                .includes(
                  normalizedSearch
                )
          );
        }
      );
    }, [
      contacts,
      search,
      sourceFilter,
      campaignFilter,
      campaignStatusFilter,
    ]);

  const selectedContacts =
    useMemo(
      () =>
        contacts.filter(
          (
            contact
          ) =>
            selectedContactIds.has(
              contact.contactId
            )
        ),
      [
        contacts,
        selectedContactIds,
      ]
    );

  const selectedCount =
    selectedContactIds.size;

  const filteredContactIds =
    useMemo(
      () =>
        filteredContacts.map(
          (
            contact
          ) =>
            contact.contactId
        ),
      [
        filteredContacts,
      ]
    );

  const allFilteredSelected =
    filteredContactIds.length >
      0 &&
    filteredContactIds.every(
      (
        contactId
      ) =>
        selectedContactIds.has(
          contactId
        )
    );

  const someFilteredSelected =
    filteredContactIds.some(
      (
        contactId
      ) =>
        selectedContactIds.has(
          contactId
        )
    );

  const toggleContact =
    (
      contactId:
        string
    ) => {
      setSelectedContactIds(
        (
          current
        ) => {
          const next =
            new Set(
              current
            );

          if (
            next.has(
              contactId
            )
          ) {
            next.delete(
              contactId
            );
          } else {
            next.add(
              contactId
            );
          }

          return next;
        }
      );
    };

  const toggleAllFiltered =
    () => {
      setSelectedContactIds(
        (
          current
        ) => {
          const next =
            new Set(
              current
            );

          if (
            allFilteredSelected
          ) {
            for (
              const contactId of
              filteredContactIds
            ) {
              next.delete(
                contactId
              );
            }
          } else {
            for (
              const contactId of
              filteredContactIds
            ) {
              next.add(
                contactId
              );
            }
          }

          return next;
        }
      );
    };

  const clearSelection =
    () => {
      setSelectedContactIds(
        new Set()
      );
    };

  const openCampaignModal =
    () => {
      if (
        !agentId
      ) {
        setErrorMessage(
          "לא נמצא סוכן פעיל."
        );
        return;
      }

      if (
        selectedCount ===
        0
      ) {
        setErrorMessage(
          "יש לבחור לפחות איש קשר אחד."
        );
        return;
      }

      if (
        selectedCount >
        100
      ) {
        setErrorMessage(
          "ניתן לשלוח עד 100 אנשי קשר בכל פעימת שליחה."
        );
        return;
      }

      setErrorMessage("");
      setSuccessMessage("");

      setIsCampaignModalOpen(
        true
      );
    };

  const openEditContact =
    (
      contact:
        MagicTouchContact
    ) => {
      setErrorMessage("");
      setSuccessMessage("");

      setEditingContact(
        contact
      );

      setEditPhone(
        contact.phone ||
          ""
      );

      setEditEmail(
        contact.email ||
          ""
      );
    };

  const closeEditContact =
    () => {
      if (
        isSavingContact
      ) {
        return;
      }

      setEditingContact(
        null
      );

      setEditPhone(
        ""
      );

      setEditEmail(
        ""
      );
    };

  const saveContactDetails =
    async () => {
      if (
        !agentId ||
        !editingContact
      ) {
        return;
      }

      const phone =
        editPhone.trim();

      const email =
        editEmail.trim();

      if (
        email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          email
        )
      ) {
        setErrorMessage(
          "כתובת האימייל אינה תקינה."
        );
        return;
      }

      try {
        setIsSavingContact(
          true
        );

        setErrorMessage("");
        setSuccessMessage("");

        const fn =
          httpsCallable<
            {
              agentId:
                string;

              contactId:
                string;

              phone:
                string;

              email:
                string;
            },
            UpdateMagicTouchContactDetailsResponse
          >(
            functions,
            "updateMagicTouchContactDetails"
          );

        await fn({
          agentId,

          contactId:
            editingContact.contactId,

          phone,

          email,
        });

        setEditingContact(
          null
        );

        setEditPhone(
          ""
        );

        setEditEmail(
          ""
        );

        setSuccessMessage(
          "פרטי איש הקשר עודכנו בהצלחה."
        );

        await loadContacts();
      } catch (
        error: any
      ) {
        console.error(
          "[MagicTouchContactsPage] Failed to update contact details",
          error
        );

        setErrorMessage(
          error?.message ||
            "עדכון פרטי איש הקשר נכשל."
        );
      } finally {
        setIsSavingContact(
          false
        );
      }
    };

  const selectedPreviewName =
    selectedContacts[0]
      ?.fullName ||
    null;

  return (
    <section
      dir="rtl"
      className="w-full"
    >
      <div className="mx-auto max-w-[1580px]">
        <header className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-bold text-blue-600">
              MagicTouch
            </div>

            <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">
              אנשי קשר
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              ניהול אנשי קשר, מקורות מידע ושליחת קמפיינים.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-2">
                <span className="text-slate-400">
                  ◉
                </span>

                <strong className="font-semibold text-slate-700">
                  {stats?.total ??
                    contacts.length}
                </strong>

                סה״כ אנשי קשר
              </span>

              <span className="hidden h-4 w-px bg-slate-200 sm:block" />

              <span className="inline-flex items-center gap-2">
                <span className="text-slate-400">
                  ◇
                </span>

                <strong className="font-semibold text-slate-700">
                  {stats
                    ?.bySource
                    ?.surense ??
                    0}
                </strong>

                מתוכם משורנס
              </span>

              <span className="hidden h-4 w-px bg-slate-200 sm:block" />

              <span className="inline-flex items-center gap-2">
                <span className="text-slate-400">
                  ▣
                </span>

                <strong className="font-semibold text-slate-700">
                  {stats
                    ?.byAppointmentStatus
                    ?.booked ??
                    0}
                </strong>

                עם פגישה שנקבעה
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/magic-touch/contacts-template"
              className="
                inline-flex
                items-center
                justify-center
                gap-2
                rounded-xl
                border
                border-slate-200
                bg-white
                px-4
                py-2.5
                text-sm
                font-semibold
                text-slate-700
                shadow-sm
                transition
                hover:border-slate-300
                hover:bg-slate-50
              "
            >
              <span aria-hidden="true">
                ⬇
              </span>

              <span>
                הורדת תבנית Excel
              </span>
            </a>

            <button
              type="button"
              onClick={() => {
                if (
                  !agentId
                ) {
                  setErrorMessage(
                    "לא נמצא סוכן פעיל לייבוא."
                  );
                  return;
                }

                setIsExcelImportOpen(
                  true
                );
              }}
              disabled={
                !agentId
              }
              className="
                inline-flex
                items-center
                justify-center
                gap-2
                rounded-xl
                border
                border-slate-200
                bg-white
                px-4
                py-2.5
                text-sm
                font-semibold
                text-slate-700
                shadow-sm
                transition
                hover:border-slate-300
                hover:bg-slate-50
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              <span aria-hidden="true">
                ⬆
              </span>

              <span>
                העלאת Excel
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (
                  !agentId
                ) {
                  setErrorMessage(
                    "לא נמצא סוכן פעיל להוספת איש קשר."
                  );
                  return;
                }

                setIsCreateModalOpen(
                  true
                );
              }}
              disabled={
                !agentId
              }
              className="
                inline-flex
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-blue-600
                px-4
                py-2.5
                text-sm
                font-semibold
                text-white
                shadow-sm
                transition
                hover:bg-blue-700
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              <span aria-hidden="true">
                ＋
              </span>

              <span>
                הוספת איש קשר
              </span>
            </button>
          </div>
        </header>

        {errorMessage ? (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700">
            {successMessage}
          </div>
        ) : null}

        {selectedCount >
        0 ? (
          <section className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_4px_18px_rgba(15,23,42,0.04)] ring-1 ring-slate-100">
            <div className="text-sm font-semibold text-slate-800">
              נבחרו{" "}
              {selectedCount}{" "}
              אנשי קשר
            </div>

            <button
              type="button"
              onClick={
                clearSelection
              }
              className="rounded-lg bg-transparent px-3 py-1.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
            >
              ניקוי בחירה
            </button>

            <div className="flex-1" />

            <button
              type="button"
              onClick={
                openCampaignModal
              }
              disabled={
                selectedCount >
                100
              }
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              שליחת קמפיין WhatsApp
            </button>
          </section>
        ) : null}

        <section className="overflow-visible bg-transparent">
          <div className="mb-3 rounded-2xl bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,0.04)] ring-1 ring-slate-100">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <input
                type="search"
                value={
                  search
                }
                onChange={(
                  event
                ) =>
                  setSearch(
                    event
                      .target
                      .value
                  )
                }
                placeholder="חיפוש לפי שם, טלפון, אימייל או תעודת זהות"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50 xl:max-w-md"
              />

              <select
                value={
                  sourceFilter
                }
                onChange={(
                  event
                ) =>
                  setSourceFilter(
                    event
                      .target
                      .value
                  )
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
              >
                <option value="">
                  כל מקורות המידע
                </option>

                <option value="surense">
                  שורנס
                </option>

                <option value="magicsale">
                  MagicSale
                </option>

                <option value="excel">
                  Excel
                </option>

                <option value="manual">
                  הוספה ידנית
                </option>

                <option value="external_crm">
                  CRM חיצוני
                </option>
              </select>

              <select
                value={
                  campaignFilter
                }
                onChange={(
                  event
                ) => {
                  const value =
                    event
                      .target
                      .value;

                  setCampaignFilter(
                    value
                  );

                  setCampaignStatusFilter(
                    value
                      ? "not_sent"
                      : ""
                  );
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
              >
                <option value="">
                  כל הקמפיינים
                </option>

                {campaignOptions.map(
                  (
                    option
                  ) => (
                    <option
                      key={
                        option.campaignId
                      }
                      value={
                        option.campaignId
                      }
                    >
                      {option.label}
                    </option>
                  )
                )}
              </select>

              <select
                value={
                  campaignStatusFilter
                }
                onChange={(
                  event
                ) =>
                  setCampaignStatusFilter(
                    event
                      .target
                      .value
                  )
                }
                disabled={
                  !campaignFilter
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">
                  כל סטטוסי הקמפיין
                </option>

                <option value="not_sent">
                  טרם נשלח
                </option>

                <option value="already_sent">
                  כבר נשלח
                </option>

                <option value="sent">
                  נשלח
                </option>

                <option value="delivered">
                  נמסר
                </option>

                <option value="read">
                  נקרא
                </option>

                <option value="replied">
                  הגיב
                </option>

                <option value="failed">
                  נכשל
                </option>
              </select>

              <div className="flex-1" />

              <div className="text-xs text-slate-400">
                מוצגים{" "}
                <strong className="text-slate-600">
                  {filteredContacts.length}
                </strong>{" "}
                מתוך{" "}
                {contacts.length}
              </div>

              <button
                type="button"
                onClick={() =>
                  void Promise.all([
                    loadContacts(),
                    loadCampaigns(),
                  ])
                }
                disabled={
                  isLoading ||
                  !agentId
                }
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {isLoading
                  ? "טוען..."
                  : "רענון"}
              </button>
            </div>

            {campaignFilter ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>
                  מסנן לפי:
                </span>

                <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">
                  {campaignOptions.find(
                    (
                      option
                    ) =>
                      option.campaignId ===
                      campaignFilter
                  )?.label ||
                    campaignFilter}
                </span>

                {campaignStatusFilter ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
                    {campaignStatusFilter ===
                    "not_sent"
                      ? "טרם נשלח"
                      : campaignStatusFilter ===
                          "already_sent"
                        ? "כבר נשלח"
                        : campaignStatusFilter ===
                            "delivered"
                          ? "נמסר ומעלה"
                          : campaignStatusFilter ===
                              "read"
                            ? "נקרא או הגיב"
                            : campaignStatusLabel(
                                campaignStatusFilter
                              )}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setCampaignFilter(
                      ""
                    );

                    setCampaignStatusFilter(
                      ""
                    );
                  }}
                  className="rounded-lg px-2 py-1 font-semibold text-blue-600 hover:bg-blue-50"
                >
                  ניקוי סינון
                </button>
              </div>
            ) : null}
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-sm text-slate-400">
              טוען אנשי קשר...
            </div>
          ) : filteredContacts
              .length ===
            0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              לא נמצאו אנשי קשר להצגה.
            </div>
          ) : (
            <div
              className="
                overflow-hidden
                rounded-2xl
                bg-white
                shadow-[0_8px_28px_rgba(15,23,42,0.05)]
                ring-1
                ring-slate-100
                [&_table]:!border-0
                [&_thead]:!border-0
                [&_tbody]:!border-0
                [&_tr]:!border-0
                [&_th]:!border-0
                [&_td]:!border-0
              "
            >
              <div className="overflow-x-auto">
                <table
                  className="
                   min-w-[1450px]
                    border-separate
                    border-spacing-0
                    text-right
                    !border-0
                    !outline-none
                  "
                  style={{
                    border:
                      "none",

                    outline:
                      "none",

                    boxShadow:
                      "none",
                  }}
                >
                  <thead className="bg-slate-50/70 text-[11px] font-bold text-slate-500">
                    <tr>
                      <th className="w-12 px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={
                            allFilteredSelected
                          }
                          ref={(
                            input
                          ) => {
                            if (
                              input
                            ) {
                              input.indeterminate =
                                someFilteredSelected &&
                                !allFilteredSelected;
                            }
                          }}
                          onChange={
                            toggleAllFiltered
                          }
                          aria-label="בחירת כל אנשי הקשר המסוננים"
                        />
                      </th>

                      <th className="px-4 py-3.5">
                        שם
                      </th>

                   <th className="min-w-[190px] px-4 py-3.5">
  <div className="flex items-center gap-2 whitespace-nowrap">
    <span className="w-[52px] shrink-0" />

    <span>
      טלפון
    </span>
  </div>
</th>
                      <th className="px-4 py-3.5">
                        מקור
                      </th>

                      <th className="px-4 py-3.5">
                        סטטוס עניין
                      </th>

                      <th className="px-4 py-3.5">
                        פגישה
                      </th>

                      <th className="px-4 py-3.5">
                        קמפיין אחרון
                      </th>

                      {hasSurenseIntegration ? (
                        <>
                          <th className="px-4 py-3.5">
                            סטטוס במקור
                          </th>

                          <th className="px-4 py-3.5">
                            סטטוס ייפוי כוח
                          </th>
                        </>
                      ) : null}

                      <th className="px-4 py-3.5">
                        עודכן
                      </th>
                    </tr>
                  </thead>

                  <tbody className="[&_tr:not(:last-child)_td]:!border-b [&_tr:not(:last-child)_td]:!border-slate-100">
                    {filteredContacts.map(
                      (
                        contact
                      ) => {
                        const isSelected =
                          selectedContactIds.has(
                            contact.contactId
                          );

                        const latestCampaign =
                          getLatestCampaign(
                            contact
                          );

                        const latestCampaignStatus =
                          String(
                            latestCampaign
                              ?.campaign
                              ?.status ||
                            ""
                          ).trim();

                        const latestCampaignName =
                          String(
                            latestCampaign
                              ?.campaign
                              ?.templateName ||
                            latestCampaign
                              ?.campaign
                              ?.campaignId ||
                            latestCampaign
                              ?.key ||
                            ""
                          ).trim();

                        return (
                          <tr
                            key={
                              contact.contactId
                            }
                            className={`transition-colors hover:bg-slate-50/70 ${
                              isSelected
                                ? "bg-blue-50/35"
                                : "bg-white"
                            }`}
                          >
                            <td className="px-4 py-3.5 text-center">
                              <input
                                type="checkbox"
                                checked={
                                  isSelected
                                }
                                onChange={() =>
                                  toggleContact(
                                    contact.contactId
                                  )
                                }
                                aria-label={`בחירת ${contact.fullName || "איש קשר"}`}
                              />
                            </td>

                            <td className="px-4 py-3.5">
                              <Link
                                href={`/MagicTouch/Contacts/${encodeURIComponent(
                                  contact.contactId
                                )}?agentId=${encodeURIComponent(
                                  agentId
                                )}`}
                                className="block rounded-md hover:text-blue-700"
                              >
                                <div className="font-semibold text-slate-900 transition hover:text-blue-700">
                                  {contact.fullName ||
                                    "ללא שם"}
                                </div>

                                {contact.email ? (
                                  <div className="mt-0.5 text-xs text-slate-400">
                                    {contact.email}
                                  </div>
                                ) : null}
                              </Link>
                            </td>

                     <td className="min-w-[190px] px-4 py-3.5">
  <div className="flex items-center gap-2 whitespace-nowrap">
    <button
      type="button"
      onClick={() =>
        openEditContact(
          contact
        )
      }
      className="w-[52px] shrink-0 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
    >
      עריכה
    </button>

    <span
      dir="ltr"
      className="w-[110px] shrink-0 whitespace-nowrap text-left text-slate-700"
    >
      {contact.phone ||
        "—"}
    </span>
  </div>
</td>
                            <td className="px-4 py-3.5">
                              {sourceLabel(
                                contact.sourceSystem
                              )}
                            </td>

                            <td className="px-4 py-3.5">
                              {(() => {
                                const status =
                                  getContactInterestStatus(
                                    contact
                                  );

                                const label =
                                  interestLabel(
                                    status
                                  );

                                const className =
                                  status ===
                                  "interested"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : status ===
                                        "not_interested"
                                      ? "bg-rose-50 text-rose-700"
                                      : "bg-slate-100 text-slate-600";

                                return (
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
                                  >
                                    {label}
                                  </span>
                                );
                              })()}
                            </td>

                            <td className="px-4 py-3.5">
                              {(() => {
                                const status =
                                  getContactAppointmentStatus(
                                    contact
                                  );

                                const label =
                                  appointmentLabel(
                                    status
                                  );

                                const className =
                                  status ===
                                  "booked"
                                    ? "bg-blue-50 text-blue-700"
                                    : status ===
                                        "cancelled"
                                      ? "bg-rose-50 text-rose-700"
                                      : "bg-slate-100 text-slate-600";

                                return (
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
                                  >
                                    {label}
                                  </span>
                                );
                              })()}
                            </td>

                            <td className="px-4 py-3.5">
                              {latestCampaign ? (
                                <div className="min-w-[145px]">
                                  <div
                                    className="max-w-[180px] truncate text-xs font-semibold text-slate-700"
                                    title={
                                      latestCampaignName
                                    }
                                  >
                                    {latestCampaignName}
                                  </div>

                                  <div className="mt-1">
                                    <span
                                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${campaignStatusClassName(
                                        latestCampaignStatus
                                      )}`}
                                    >
                                      {campaignStatusLabel(
                                        latestCampaignStatus
                                      )}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  —
                                </span>
                              )}
                            </td>

                            {hasSurenseIntegration ? (
                              <>
                                <td className="px-4 py-3.5">
                                  {contact.sourceSystem ===
                                  "surense"
                                    ? contact
                                        .sourceData
                                        ?.surense
                                        ?.statusName ||
                                      "—"
                                    : "—"}
                                </td>

                                <td className="px-4 py-3.5">
                                  {contact.sourceSystem ===
                                  "surense" ? (
                                    <span
                                      className={[
                                        "inline-flex rounded-full px-3 py-1 text-xs font-bold",

                                        contact
                                          .engagement
                                          ?.reengagement
                                          ?.powerOfAttorney
                                          ?.status ===
                                        "signed"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : contact
                                                .engagement
                                                ?.reengagement
                                                ?.powerOfAttorney
                                                ?.status ===
                                              "partially_signed"
                                            ? "bg-amber-100 text-amber-700"
                                            : contact
                                                  .engagement
                                                  ?.reengagement
                                                  ?.powerOfAttorney
                                                  ?.status ===
                                                "waiting_for_signature"
                                              ? "bg-blue-100 text-blue-700"
                                              : "bg-slate-100 text-slate-500 border border-slate-200",
                                      ].join(
                                        " "
                                      )}
                                    >
                                      {powerOfAttorneyLabel(
                                        contact
                                          .engagement
                                          ?.reengagement
                                          ?.powerOfAttorney
                                          ?.status ||
                                          ""
                                      )}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                              </>
                            ) : null}

                            <td className="px-4 py-3.5 text-xs text-slate-500">
                              {formatDate(
                                contact.updatedAt
                              )}
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {editingContact &&
      agentId ? (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 p-4"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeEditContact();
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-blue-600">
                  MagicTouch
                </div>

                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  עריכת פרטי איש קשר
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {editingContact.fullName ||
                    "איש קשר"}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeEditContact
                }
                disabled={
                  isSavingContact
                }
                className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                aria-label="סגירה"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  טלפון
                </span>

                <input
                  type="tel"
                  dir="ltr"
                  value={
                    editPhone
                  }
                  onChange={(
                    event
                  ) =>
                    setEditPhone(
                      event
                        .target
                        .value
                    )
                  }
                  placeholder="050-1234567"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                />

                <span className="mt-1 block text-xs text-slate-400">
                  המספר יישמר גם בפורמט מנורמל לצורך WhatsApp.
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                  אימייל
                </span>

                <input
                  type="email"
                  dir="ltr"
                  value={
                    editEmail
                  }
                  onChange={(
                    event
                  ) =>
                    setEditEmail(
                      event
                        .target
                        .value
                    )
                  }
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={
                  closeEditContact
                }
                disabled={
                  isSavingContact
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ביטול
              </button>

              <button
                type="button"
                onClick={() =>
                  void saveContactDetails()
                }
                disabled={
                  isSavingContact
                }
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingContact
                  ? "שומר..."
                  : "שמירת שינויים"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateModalOpen &&
      agentId ? (
        <CreateMagicTouchContactModal
          agentId={
            agentId
          }
          onClose={() => {
            setIsCreateModalOpen(
              false
            );
          }}
          onCreated={async () => {
            await loadContacts();
          }}
        />
      ) : null}

      {isExcelImportOpen &&
      agentId ? (
        <ImportMagicTouchExcelModal
          agentId={
            agentId
          }
          onClose={() => {
            setIsExcelImportOpen(
              false
            );
          }}
          onImported={async () => {
            await loadContacts();
          }}
        />
      ) : null}

      {isCampaignModalOpen &&
      agentId &&
      selectedCount >
        0 ? (
        <SendMagicTouchCampaignModal
          agentId={
            agentId
          }
          contactIds={Array.from(
            selectedContactIds
          )}
          campaigns={
            campaignCatalog
          }
          preselectedCampaignId={
            campaignFilter ||
            null
          }
          selectedContactName={
            selectedPreviewName
          }
          onClose={() => {
            setIsCampaignModalOpen(
              false
            );
          }}
          onSent={async (
            result
          ) => {
            const skipped =
              Number(
                result.skipped ||
                0
              );

            setSuccessMessage(
              result.failed >
                0
                ? `הפעימה הסתיימה בקמפיין ${result.campaignName}: ${result.sent} נשלחו, ${result.failed} נכשלו${
                    skipped >
                    0
                      ? `, ${skipped} כבר היו בקמפיין`
                      : ""
                  }.`
                : `הפעימה נשלחה בקמפיין ${result.campaignName}: ${result.sent} נשלחו${
                    skipped >
                    0
                      ? `, ${skipped} כבר היו בקמפיין ולא נשלחו שוב`
                      : ""
                  }.`
            );

            clearSelection();

            setCampaignFilter(
              result.campaignId
            );

            setCampaignStatusFilter(
              "not_sent"
            );

            await Promise.all([
              loadContacts(),
              loadCampaigns(),
            ]);
          }}
        />
      ) : null}
    </section>
  );
}