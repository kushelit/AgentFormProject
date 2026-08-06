'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import Link from 'next/link';

import {
  httpsCallable,
} from 'firebase/functions';

import {
  functions,
} from '@/lib/firebase/firebase';

import {
  getAgentSurenseConfig,
} from "@/lib/MagicTouch/integrations/surense/api";

import useFetchAgentData from '@/hooks/useFetchAgentData';

import CreateMagicTouchContactModal from '@/components/MagicTouch/CreateMagicTouchContactModal';
import ImportMagicTouchExcelModal from '@/components/MagicTouch/ImportMagicTouchExcelModal';
import SendMagicTouchCampaignModal from '@/components/MagicTouch/SendMagicTouchCampaignModal';



type SourceSystem =
  | 'surense'
  | 'magicsale'
  | 'excel'
  | 'manual'
  | 'external_crm'
  | 'other';

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

  sourceSystem:
    SourceSystem;

  sourceRecordId:
    string | null;

  sourceData?: {
    surense?: {
      customerId:
        string | null;

      workflowId:
        string | null;

      statusName:
        string | null;

      statusActive:
        boolean | null;

      lastActivityDate:
        string | null;
    } | null;

    magicsale?: {
      customerDocId:
        string | null;

      customerId:
        string | null;
    } | null;

    excel?: {
      importId:
        string | null;

      fileName:
        string | null;

      rowNumber:
        number | null;

      uploadedBy:
        string | null;
    } | null;
  };

  engagement?: {
    reengagement?: {
      status?:
        string | null;

      interestStatus?:
        string | null;

      interestRespondedAt?:
        number | null;

      bookingStatus?:
        string | null;

      bookingLink?:
        string | null;

      bookingLinkSentAt?:
        number | null;

      bookedAt?:
        number | null;

        powerOfAttorney?: {
  status?: string | null;
  requestedAt?: number | null;
  lastCheckedAt?: number | null;
  signedAt?: number | null;
  reminderDue?: boolean;
} | null;

      resolvedAt?:
        number | null;

      lastFlowRunId?:
        string | null;

      surenseSyncStatus?:
        string | null;

      surenseSyncedAt?:
        number | null;

      updatedAt?:
        number | null;
    } | null;
  } | null;

  contactStatus:
    string;

  interestStatus:
    string;

  appointmentStatus:
    string;

  appointmentProvider:
    string | null;

  consentStatus:
    string;

  tags:
    string[];

  notes:
    string | null;

  lastInboundAt:
    number | null;

  lastOutboundAt:
    number | null;

  lastReplyText:
    string | null;

  sourceLastSyncedAt:
    number | null;

  createdAt:
    number | null;

  updatedAt:
    number | null;
};

type MagicTouchStats = {
  total:
    number;

  bySource:
    Record<
      string,
      number
    >;

  byContactStatus:
    Record<
      string,
      number
    >;

  byInterestStatus:
    Record<
      string,
      number
    >;

  byAppointmentStatus:
    Record<
      string,
      number
    >;

  withPhone:
    number;

  withoutPhone:
    number;

  withEmail:
    number;

  withoutEmail:
    number;
};

type GetMagicTouchContactsResponse = {
  ok:
    boolean;

  agentId:
    string;

  contacts:
    MagicTouchContact[];

  stats:
    MagicTouchStats;

  count:
    number;

  limit:
    number;
};

type SendCampaignResponse = {
  ok:
    boolean;

  partialSuccess:
    boolean;

  agentId:
    string;

  campaignId:
    string;

  campaignName:
    string;

  templateName:
    string;

  received:
    number;

  sent:
    number;

  failed:
    number;

  status:
    string;
};

function formatDate(
  value:
    number | null
): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'he-IL',
    {
      dateStyle:
        'short',

      timeStyle:
        'short',
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
    case 'surense':
      return 'שורנס';

    case 'magicsale':
      return 'MagicSale';

    case 'excel':
      return 'Excel';

    case 'manual':
      return 'ידני';

    case 'external_crm':
      return 'CRM חיצוני';

    default:
      return 'אחר';
  }
}

function interestLabel(
  status:
    string
): string {
  switch (
    status
  ) {
    case 'interested':
      return 'מעוניין';

    case 'not_interested':
      return 'לא מעוניין';

    case 'pending':
      return 'ממתין לתגובה';

    case 'no_response':
      return 'ללא תגובה';

    default:
      return 'טרם נוצר קשר';
  }
}

function appointmentLabel(
  status:
    string
): string {
  switch (
    status
  ) {
    case 'link_sent':
      return 'נשלח קישור';

    case 'booked':
      return 'נקבעה פגישה';

    case 'cancelled':
      return 'הפגישה בוטלה';

    case 'no_booking':
      return 'לא נקבעה';

    case 'not_required':
      return 'לא נדרש';

    default:
      return 'טרם נשלח';
  }
}
function powerOfAttorneyLabel(
  status: string
): string {
  switch (status) {
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
    ''
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
    ''
  );
}

export default function MagicTouchContactsPage() {
  const {
    selectedAgentId,
  } =
    useFetchAgentData();

  const agentId =
    selectedAgentId;


    const [
  hasSurenseIntegration,
  setHasSurenseIntegration,
] = useState(false);


  const [
    contacts,
    setContacts,
  ] =
    useState<
      MagicTouchContact[]
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
    useState('');

  const [
    sourceFilter,
    setSourceFilter,
  ] =
    useState('');

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('');

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState('');

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
        setErrorMessage('');

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
              'getMagicTouchContacts'
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
            '[MagicTouchContactsPage] Failed to load contacts',
            error
          );

          setContacts([]);
          setStats(null);

          setErrorMessage(
            error?.message ||
              'לא ניתן היה לטעון את אנשי הקשר.'
          );
        } finally {
          setIsLoading(false);
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

  const loadSurenseConfig = async () => {
    try {
      const result =
        await getAgentSurenseConfig(
          agentId
        );

      setHasSurenseIntegration(
        result.config.enabled === true
      );
    } catch (error) {
      console.error(
        "[MagicTouchContactsPage] Failed to load Surense config",
        error
      );

      setHasSurenseIntegration(false);
    }
  };

  void loadSurenseConfig();
}, [agentId]);

  useEffect(() => {
    void loadContacts();
  }, [
    loadContacts,
  ]);

  useEffect(() => {
    setSelectedContactIds(
      new Set()
    );

    setIsCampaignModalOpen(
      false
    );
  }, [
    agentId,
  ]);

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
                '',
              contact.idNumber ||
                '',
              contact.sourceRecordId ||
                '',
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
          'לא נמצא סוכן פעיל.'
        );
        return;
      }

      if (
        selectedCount ===
        0
      ) {
        setErrorMessage(
          'יש לבחור לפחות איש קשר אחד.'
        );
        return;
      }

      if (
        selectedCount >
        100
      ) {
        setErrorMessage(
          'ניתן לשלוח עד 100 אנשי קשר בכל קמפיין.'
        );
        return;
      }

      setErrorMessage('');
      setSuccessMessage('');

      setIsCampaignModalOpen(
        true
      );
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
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-medium text-blue-700">
              Magic Touch
            </div>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              אנשי קשר
            </h1>

            <p className="mt-2 text-gray-600">
              ניהול אנשי קשר, מקורות מידע ושליחת קמפיינים.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/magic-touch/contacts-template"
              className="
                inline-flex
                items-center
                justify-center
                gap-2
                rounded-lg
                border
                border-slate-300
                bg-white
                px-4
                py-2.5
                font-semibold
                text-slate-700
                shadow-sm
                transition
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
                if (!agentId) {
                  setErrorMessage(
                    'לא נמצא סוכן פעיל לייבוא.'
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
                rounded-lg
                border
                border-slate-300
                bg-white
                px-4
                py-2.5
                font-semibold
                text-slate-700
                shadow-sm
                transition
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
                if (!agentId) {
                  setErrorMessage(
                    'לא נמצא סוכן פעיל להוספת איש קשר.'
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
                rounded-lg
                bg-blue-600
                px-4
                py-2.5
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

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">
              סך הכול אנשי קשר
            </div>

            <div className="mt-2 text-2xl font-bold">
              {stats?.total ??
                contacts.length}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">
              עם מספר טלפון
            </div>

            <div className="mt-2 text-2xl font-bold">
              {stats?.withPhone ??
                0}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">
              הגיעו משורנס
            </div>

            <div className="mt-2 text-2xl font-bold">
              {stats
                ?.bySource
                ?.surense ??
                0}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">
              נקבעה פגישה
            </div>

            <div className="mt-2 text-2xl font-bold">
              {stats
                ?.byAppointmentStatus
                ?.booked ??
                0}
            </div>
          </div>
        </section>

        {selectedCount >
        0 ? (
          <section className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="font-semibold text-blue-900">
              נבחרו{' '}
              {selectedCount}{' '}
              אנשי קשר
            </div>

            <button
              type="button"
              onClick={
                clearSelection
              }
              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
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
              className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              שליחת קמפיין WhatsApp
            </button>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row">
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
                className="w-full rounded-lg border px-3 py-2 md:max-w-md"
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
                className="rounded-lg border px-3 py-2"
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
            </div>

            <button
              type="button"
              onClick={() =>
                void loadContacts()
              }
              disabled={
                isLoading ||
                !agentId
              }
              className="rounded-lg border px-4 py-2 font-medium disabled:opacity-50"
            >
              {isLoading
                ? 'טוען...'
                : 'רענון'}
            </button>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              טוען אנשי קשר...
            </div>
          ) : filteredContacts
              .length ===
            0 ? (
            <div className="p-8 text-center text-gray-500">
              לא נמצאו אנשי קשר להצגה.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-right">
                <thead className="bg-gray-50 text-sm text-gray-600">
                  <tr>
                    <th className="w-12 px-4 py-3 text-center">
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

                    <th className="px-4 py-3">
                      שם
                    </th>

                    <th className="px-4 py-3">
                      טלפון
                    </th>

                    <th className="px-4 py-3">
                      מקור
                    </th>

                    <th className="px-4 py-3">
                      סטטוס עניין
                    </th>

                    <th className="px-4 py-3">
                      פגישה
                    </th>

                  {hasSurenseIntegration ? (
  <>
    <th className="px-4 py-3">
      סטטוס במקור
    </th>

    <th className="px-4 py-3">
      סטטוס ייפוי כוח
    </th>
  </>
) : null}

                    <th className="px-4 py-3">
                      עודכן
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {filteredContacts.map(
                    (
                      contact
                    ) => {
                      const isSelected =
                        selectedContactIds.has(
                          contact.contactId
                        );

                      return (
                        <tr
                          key={
                            contact.contactId
                          }
                          className={`hover:bg-gray-50 ${
                            isSelected
                              ? 'bg-blue-50/60'
                              : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-center">
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
                              aria-label={`בחירת ${contact.fullName || 'איש קשר'}`}
                            />
                          </td>

                          <td className="px-4 py-3">
                            <Link
                              href={`/MagicTouch/Contacts/${encodeURIComponent(
                                contact.contactId
                              )}?agentId=${encodeURIComponent(
                                agentId
                              )}`}
                              className="block rounded-md hover:text-blue-700"
                            >
                              <div className="font-medium text-gray-900 hover:text-blue-700">
                                {contact.fullName ||
                                  'ללא שם'}
                              </div>

                              {contact.email ? (
                                <div className="text-sm text-gray-500">
                                  {contact.email}
                                </div>
                              ) : null}
                            </Link>
                          </td>

                          <td
                            className="px-4 py-3"
                            dir="ltr"
                          >
                            {contact.phone ||
                              '—'}
                          </td>

                          <td className="px-4 py-3">
                            {sourceLabel(
                              contact.sourceSystem
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {interestLabel(
                              getContactInterestStatus(
                                contact
                              )
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {appointmentLabel(
                              getContactAppointmentStatus(
                                contact
                              )
                            )}
                          </td>

                          {hasSurenseIntegration ? (
  <>
    <td className="px-4 py-3">
      {contact.sourceSystem === "surense"
        ? contact
            .sourceData
            ?.surense
            ?.statusName || "—"
        : "—"}
    </td>

    <td className="px-4 py-3">
      {contact.sourceSystem === "surense" ? (
        <span
          className={[
            "inline-flex rounded-full px-3 py-1 text-xs font-bold",

            contact
              .engagement
              ?.reengagement
              ?.powerOfAttorney
              ?.status === "signed"
              ? "bg-emerald-100 text-emerald-700"
              : contact
                    .engagement
                    ?.reengagement
                    ?.powerOfAttorney
                    ?.status === "partially_signed"
                ? "bg-amber-100 text-amber-700"
                : contact
                      .engagement
                      ?.reengagement
                      ?.powerOfAttorney
                      ?.status === "waiting_for_signature"
                  ? "bg-blue-100 text-blue-700"
                 : "bg-slate-100 text-slate-500 border border-slate-200",
          ].join(" ")}
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

                          <td className="px-4 py-3">
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
          )}
        </section>
      </div>

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
            setSuccessMessage(
              result.failed >
                0
                ? `הקמפיין הסתיים: ${result.sent} נשלחו, ${result.failed} נכשלו.`
                : `הקמפיין נשלח בהצלחה ל-${result.sent} אנשי קשר.`
            );

            clearSelection();

            await loadContacts();
          }}
        />
      ) : null}
    </section>
  );
}