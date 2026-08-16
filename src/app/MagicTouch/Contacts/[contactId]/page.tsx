'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import Link from 'next/link';

import {
  useParams,
  useSearchParams,
} from 'next/navigation';

import {
  httpsCallable,
} from 'firebase/functions';

import {
  functions,
} from '@/lib/firebase/firebase';

import {
  useMagicTouchAgent,
} from '@/components/MagicTouch/MagicTouchAgentContext';

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

  sourceSystem: string;
  sourceRecordId: string | null;

  sourceData?: {
    surense?: {
      customerId?: string | null;
      workflowId?: string | null;
      statusName?: string | null;
      statusActive?: boolean | null;
      lastActivityDate?: string | null;
    } | null;

    magicsale?: {
      customerDocId?: string | null;
      customerId?: string | null;
    } | null;

    excel?: {
      importId?: string | null;
      fileName?: string | null;
      rowNumber?: number | null;
      uploadedBy?: string | null;
    } | null;

    external_crm?: {
      integrationId?: string | null;
      integrationName?: string | null;
    } | null;
  };

  contactStatus: string;
  interestStatus: string;
  appointmentStatus: string;
  appointmentProvider: string | null;
  consentStatus: string;

  engagement?: {
    reengagement?: {
      status?: string | null;
      interestStatus?: string | null;
      bookingStatus?: string | null;
      bookingLink?: string | null;
      bookingLinkSentAt?: number | null;
      bookedAt?: number | null;
      bookingCancelledAt?: number | null;
      bookingStartAt?: number | null;
      bookingEndAt?: number | null;
      bookingServiceName?: string | null;
      bookingAppointmentId?: string | null;
      resolvedAt?: number | null;
      updatedAt?: number | null;
    };
  };

  tags: string[];
  notes: string | null;

  lastInboundAt: number | null;
  lastOutboundAt: number | null;
  lastReplyText: string | null;

  sourceLastSyncedAt: number | null;
  lastTimelineEventAt?: number | null;

  createdAt: number | null;
  updatedAt: number | null;
};

type TimelineEvent = {
  id: string;
  eventId: string;

  type: string;
  channel: string;

  title: string;
  description: string | null;

  direction:
    | 'inbound'
    | 'outbound'
    | 'internal'
    | null;

  status:
    | 'pending'
    | 'completed'
    | 'failed'
    | 'cancelled';

  sourceSystem: string | null;
  sourceRecordId: string | null;

  metadata?: Record<string, unknown>;

  createdBy: string;

  occurredAt: number | null;
  createdAt: number | null;
  updatedAt: number | null;
};

type GetContactDetailsResponse = {
  ok: boolean;
  agentId: string;
  contactId: string;

  contact: MagicTouchContact;
  timeline: TimelineEvent[];

  timelineCount: number;
  timelineLimit: number;
};

type AddContactNoteResponse = {
  ok: boolean;
  agentId: string;
  contactId: string;
  eventId: string;
};

type ActivityFilter =
  | 'all'
  | 'whatsapp'
  | 'appointments'
  | 'notes'
  | 'process';

const ACTIVITY_PREVIEW_COUNT =
  8;

function formatDateTime(
  value: unknown
): string {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  let rawValue: unknown =
    value;

  if (
    typeof value === 'object' &&
    value !== null
  ) {
    const record =
      value as Record<
        string,
        unknown
      >;

    if (
      typeof record.dateTime ===
      'string'
    ) {
      rawValue =
        record.dateTime;
    } else if (
      typeof record.toMillis ===
      'function'
    ) {
      rawValue =
        (
          record.toMillis as
            () => number
        )();
    } else if (
      typeof record._seconds ===
      'number'
    ) {
      rawValue =
        record._seconds *
        1000;
    } else if (
      typeof record.seconds ===
      'number'
    ) {
      rawValue =
        record.seconds *
        1000;
    }
  }

  const parsedDate =
    rawValue instanceof Date
      ? rawValue
      : new Date(
          rawValue as
            string | number
        );

  if (
    Number.isNaN(
      parsedDate.getTime()
    )
  ) {
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
    parsedDate
  );
}

function formatBirthDate(
  value: string | null
): string {
  if (!value) {
    return '—';
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'he-IL',
    {
      dateStyle:
        'short',
    }
  ).format(
    parsed
  );
}

function sourceLabel(
  source: string
): string {
  switch (source) {
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
      return source || 'אחר';
  }
}

function interestLabel(
  status: string
): string {
  switch (status) {
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
  status: string
): string {
  switch (status) {
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

function processStatusLabel(
  status: string
): string {
  switch (status) {
    case 'pending':
      return 'ממתין';

    case 'sent':
      return 'נשלחה פנייה';

    case 'interested':
      return 'מעוניין';

    case 'declined':
      return 'לא מעוניין';

    case 'booked':
      return 'נקבעה פגישה';

    case 'completed':
      return 'הושלם';

    default:
      return status || '—';
  }
}

function contactStatusLabel(
  status: string
): string {
  switch (
    String(
      status ||
        ''
    ).toLowerCase()
  ) {
    case 'active':
      return 'פעיל';

    case 'inactive':
      return 'לא פעיל';

    default:
      return status || '—';
  }
}

function consentStatusLabel(
  status: string
): string {
  switch (
    String(
      status ||
        ''
    ).toLowerCase()
  ) {
    case 'granted':
    case 'approved':
    case 'consented':
      return 'מאושר';

    case 'denied':
    case 'declined':
      return 'לא מאושר';

    case 'unknown':
    case '':
      return 'לא ידוע';

    default:
      return status;
  }
}

function timelineIcon(
  event: TimelineEvent
): string {
  switch (event.type) {
    case 'note_added':
      return '📝';

    case 'whatsapp_template_sent':
    case 'whatsapp_message_sent':
    case 'whatsapp_received':
      return '💬';

    case 'booking_link_sent':
      return '🔗';

    case 'appointment_booked':
    case 'microsoft_booking_created':
      return '📅';

    case 'appointment_cancelled':
    case 'microsoft_booking_cancelled':
      return '📅';

    case 'interest_updated':
      return '⭐';

    case 'contact_created':
      return '👤';

    case 'power_of_attorney_created':
      return '✍️';

    case 'document_request_created':
      return '🪪';

    default:
      return '•';
  }
}

function activityTypeLabel(
  event: TimelineEvent
): string {
  switch (event.type) {
    case 'note_added':
      return 'הערה';

    case 'whatsapp_template_sent':
    case 'whatsapp_message_sent':
    case 'whatsapp_received':
      return 'WhatsApp';

    case 'booking_link_sent':
    case 'appointment_booked':
    case 'microsoft_booking_created':
    case 'appointment_cancelled':
    case 'microsoft_booking_cancelled':
      return 'פגישה';

    case 'interest_updated':
      return 'סטטוס';

    case 'contact_created':
      return 'לקוח';

    case 'power_of_attorney_created':
    case 'document_request_created':
      return 'תהליך';

    default:
      return 'פעילות';
  }
}

function matchesActivityFilter(
  event: TimelineEvent,
  filter: ActivityFilter
): boolean {
  if (
    filter ===
    'all'
  ) {
    return true;
  }

  if (
    filter ===
    'whatsapp'
  ) {
    return (
      event.type ===
        'whatsapp_template_sent' ||
      event.type ===
        'whatsapp_message_sent' ||
      event.type ===
        'whatsapp_received'
    );
  }

  if (
    filter ===
    'appointments'
  ) {
    return (
      event.type ===
        'booking_link_sent' ||
      event.type ===
        'appointment_booked' ||
      event.type ===
        'appointment_cancelled' ||
      event.type ===
        'microsoft_booking_created' ||
      event.type ===
        'microsoft_booking_cancelled'
    );
  }

  if (
    filter ===
    'notes'
  ) {
    return (
      event.type ===
      'note_added'
    );
  }

  return (
    event.type ===
      'interest_updated' ||
    event.type ===
      'power_of_attorney_created' ||
    event.type ===
      'document_request_created' ||
    event.type ===
      'contact_created'
  );
}

function contactInitials(
  fullName: string
): string {
  const parts =
    String(
      fullName ||
        ''
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (
    parts.length ===
    0
  ) {
    return '?';
  }

  if (
    parts.length ===
    1
  ) {
    return parts[0]
      .slice(
        0,
        2
      )
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[
      parts.length - 1
    ][0]
  ).toUpperCase();
}

export default function MagicTouchContactDetailsPage() {
  const params =
    useParams<{
      contactId:
        string;
    }>();

  const searchParams =
    useSearchParams();

  const {
    selectedAgentId,
  } =
    useMagicTouchAgent();

  const contactId =
    String(
      params?.contactId ||
        ''
    ).trim();

  const agentIdFromUrl =
    String(
      searchParams.get(
        'agentId'
      ) ||
        ''
    ).trim();

  const agentId =
    agentIdFromUrl ||
    selectedAgentId;

  const [
    contact,
    setContact,
  ] =
    useState<
      MagicTouchContact |
      null
    >(null);

  const [
    timeline,
    setTimeline,
  ] =
    useState<
      TimelineEvent[]
    >([]);

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(
      true
    );

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState(
      ''
    );

  const [
    note,
    setNote,
  ] =
    useState(
      ''
    );

  const [
    isSavingNote,
    setIsSavingNote,
  ] =
    useState(
      false
    );

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState(
      ''
    );

  const [
    showAllActivity,
    setShowAllActivity,
  ] =
    useState(
      false
    );

  const [
    activityFilter,
    setActivityFilter,
  ] =
    useState<ActivityFilter>(
      'all'
    );

  const [
    showSystemInfo,
    setShowSystemInfo,
  ] =
    useState(
      false
    );

  const loadContact =
    useCallback(
      async () => {
        if (
          !agentId ||
          !contactId
        ) {
          setContact(
            null
          );

          setTimeline(
            []
          );

          setIsLoading(
            false
          );

          setErrorMessage(
            'לא נמצאו פרטי סוכן או איש קשר.'
          );

          return;
        }

        setIsLoading(
          true
        );

        setErrorMessage(
          ''
        );

        try {
          const fn =
            httpsCallable<
              {
                agentId:
                  string;
                contactId:
                  string;
                timelineLimit:
                  number;
              },
              GetContactDetailsResponse
            >(
              functions,
              'getMagicTouchContactDetails'
            );

          const response =
            await fn({
              agentId,
              contactId,
              timelineLimit:
                200,
            });

          setContact(
            response.data
              .contact ||
              null
          );

          setTimeline(
            Array.isArray(
              response.data
                .timeline
            )
              ? response.data
                  .timeline
              : []
          );
        } catch (
          error: any
        ) {
          console.error(
            '[MagicTouchContactDetailsPage] Failed to load contact',
            error
          );

          setContact(
            null
          );

          setTimeline(
            []
          );

          setErrorMessage(
            error?.message ||
              'לא ניתן היה לטעון את פרטי איש הקשר.'
          );
        } finally {
          setIsLoading(
            false
          );
        }
      },
      [
        agentId,
        contactId,
      ]
    );

  useEffect(
    () => {
      void loadContact();
    },
    [
      loadContact,
    ]
  );

  const handleAddNote =
    async (
      event:
        FormEvent<HTMLFormElement>
    ) => {
      event.preventDefault();

      if (
        isSavingNote
      ) {
        return;
      }

      const normalizedNote =
        note.trim();

      if (
        !normalizedNote
      ) {
        setErrorMessage(
          'יש להזין הערה.'
        );

        return;
      }

      if (
        !agentId ||
        !contactId
      ) {
        setErrorMessage(
          'לא נמצאו פרטי סוכן או איש קשר.'
        );

        return;
      }

      setIsSavingNote(
        true
      );

      setErrorMessage(
        ''
      );

      setSuccessMessage(
        ''
      );

      try {
        const fn =
          httpsCallable<
            {
              agentId:
                string;
              contactId:
                string;
              note:
                string;
            },
            AddContactNoteResponse
          >(
            functions,
            'addMagicTouchContactNote'
          );

        await fn({
          agentId,
          contactId,
          note:
            normalizedNote,
        });

        setNote(
          ''
        );

        setSuccessMessage(
          'ההערה נוספה בהצלחה.'
        );

        await loadContact();
      } catch (
        error: any
      ) {
        console.error(
          '[MagicTouchContactDetailsPage] Failed to add note',
          error
        );

        setErrorMessage(
          error?.message ||
            'לא ניתן היה להוסיף את ההערה.'
        );
      } finally {
        setIsSavingNote(
          false
        );
      }
    };

  const reengagement =
    contact?.engagement
      ?.reengagement;

  const displayedInterestStatus =
    String(
      reengagement
        ?.interestStatus ||
        contact
          ?.interestStatus ||
        ''
    );

  const displayedBookingStatus =
    String(
      reengagement
        ?.bookingStatus ||
        contact
          ?.appointmentStatus ||
        ''
    );

  const displayedProcessStatus =
    String(
      reengagement
        ?.status ||
        ''
    );

  const filteredTimeline =
    useMemo(
      () =>
        timeline.filter(
          (
            event
          ) =>
            matchesActivityFilter(
              event,
              activityFilter
            )
        ),
      [
        timeline,
        activityFilter,
      ]
    );

  const displayedTimeline =
    useMemo(
      () =>
        showAllActivity
          ? filteredTimeline
          : filteredTimeline.slice(
              0,
              ACTIVITY_PREVIEW_COUNT
            ),
      [
        filteredTimeline,
        showAllActivity,
      ]
    );

  const visibleTags =
    useMemo(
      () => {
        if (
          !contact ||
          !Array.isArray(
            contact.tags
          )
        ) {
          return [];
        }

        return contact.tags.filter(
          (
            tag
          ) =>
            !(
              contact.sourceSystem ===
                'surense' &&
              String(
                tag
              ).toLowerCase() ===
                'surense'
            )
        );
      },
      [
        contact,
      ]
    );

  const conversationHref =
    useMemo(
      () => {
        if (
          !contact
        ) {
          return '';
        }

        const conversationId =
          `${agentId}_${contact.phoneNormalized || contact.phone}`;

        return `/MagicTouch/Conversations?conversationId=${encodeURIComponent(
          conversationId
        )}`;
      },
      [
        agentId,
        contact,
      ]
    );

  if (
    isLoading
  ) {
    return (
      <div
        dir="rtl"
        className="p-8 text-center text-slate-500"
      >
        טוען את פרטי איש הקשר...
      </div>
    );
  }

  return (
    <section
      dir="rtl"
      className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6"
    >
      <div className="mx-auto max-w-7xl">
        <Link
          href="/MagicTouch/Contacts"
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"
        >
          ← חזרה לאנשי קשר
        </Link>

        {errorMessage ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {!contact ? (
          <div className="mt-6 rounded-2xl border bg-white p-10 text-center text-slate-500 shadow-sm">
            איש הקשר לא נמצא.
          </div>
        ) : (
          <>
            <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="p-6 sm:p-7">
                <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white shadow-sm">
                      {contactInitials(
                        contact.fullName
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-wide text-blue-600">
                        כרטיס לקוח
                      </div>

                      <h1 className="mt-1 truncate text-3xl font-bold text-slate-900">
                        {contact.fullName ||
                          'ללא שם'}
                      </h1>

                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
                        {contact.phone ? (
                          <span
                            dir="ltr"
                            className="font-medium"
                          >
                            📞 {contact.phone}
                          </span>
                        ) : null}

                        {contact.email ? (
                          <span
                            dir="ltr"
                            className="font-medium"
                          >
                            ✉️ {contact.email}
                          </span>
                        ) : null}

                        {contact.idNumber ? (
                          <span>
                            🪪 ת״ז {contact.idNumber}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          {sourceLabel(
                            contact.sourceSystem
                          )}
                        </span>

                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                          {contactStatusLabel(
                            contact.contactStatus
                          )}
                        </span>

                        {visibleTags
                          .slice(
                            0,
                            3
                          )
                          .map(
                            (
                              tag
                            ) => (
                              <span
                                key={
                                  tag
                                }
                                className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                              >
                                {tag}
                              </span>
                            )
                          )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone}`}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        📞 התקשרות
                      </a>
                    ) : null}

                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        ✉️ אימייל
                      </a>
                    ) : null}

                    {conversationHref ? (
                      <Link
                        href={
                          conversationHref
                        }
                        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                      >
                        💬 מעבר לשיחה
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatusCard
                icon="⚡"
                label="סטטוס חידוש קשר"
                value={processStatusLabel(
                  displayedProcessStatus
                )}
                description="הסטטוס בתהליך חידוש הקשר"
              />

              <StatusCard
                icon="⭐"
                label="עניין"
                value={interestLabel(
                  displayedInterestStatus
                )}
                description="תגובת הלקוח"
              />

              <StatusCard
                icon="📅"
                label="פגישה"
                value={appointmentLabel(
                  displayedBookingStatus
                )}
                description={
                  reengagement
                    ?.bookingStartAt
                    ? formatDateTime(
                        reengagement.bookingStartAt
                      )
                    : 'אין מועד פעיל'
                }
              />

              <StatusCard
                icon="🕘"
                label="פעילות אחרונה"
                value={formatDateTime(
                  contact.lastTimelineEventAt ||
                    contact.updatedAt
                )}
                description={
                  contact.lastReplyText
                    ? `תגובה אחרונה: ${contact.lastReplyText}`
                    : 'עדכון אחרון בכרטיס'
                }
              />
            </section>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <main className="space-y-6">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div>
                    <div className="text-xs font-bold text-blue-600">
                      המשך טיפול
                    </div>

                    <h2 className="mt-1 text-xl font-bold text-slate-900">
                      נתונים רלוונטיים להמשך
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      מידע תפעולי אחרון שיכול לסייע בטיפול בלקוח.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {reengagement
                      ?.bookingServiceName ? (
                      <InfoBlock
                        label="סוג הפגישה"
                        value={
                          reengagement.bookingServiceName
                        }
                      />
                    ) : null}

                    {reengagement
                      ?.bookingStartAt ? (
                      <InfoBlock
                        label="מועד הפגישה"
                        value={formatDateTime(
                          reengagement.bookingStartAt
                        )}
                      />
                    ) : null}

                    {reengagement
                      ?.bookingCancelledAt ? (
                      <InfoBlock
                        label="מועד ביטול הפגישה"
                        value={formatDateTime(
                          reengagement.bookingCancelledAt
                        )}
                      />
                    ) : null}

                    <InfoBlock
                      label="פעילות נכנסת אחרונה"
                      value={formatDateTime(
                        contact.lastInboundAt
                      )}
                    />

                    <InfoBlock
                      label="פעילות יוצאת אחרונה"
                      value={formatDateTime(
                        contact.lastOutboundAt
                      )}
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-lg">
                      📝
                    </div>

                    <div>
                      <h2 className="font-bold text-slate-900">
                        הערה חדשה
                      </h2>

                      <p className="text-xs text-slate-500">
                        תישמר בהיסטוריית הלקוח
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={
                      handleAddNote
                    }
                    className="mt-4"
                  >
                    <textarea
                      value={
                        note
                      }
                      onChange={(
                        event
                      ) =>
                        setNote(
                          event.target
                            .value
                        )
                      }
                      disabled={
                        isSavingNote
                      }
                      rows={
                        3
                      }
                      maxLength={
                        5000
                      }
                      placeholder="כתבי הערה, תזכורת או מידע חשוב להמשך הטיפול..."
                      className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    />

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-400">
                        {note.length}/5000
                      </span>

                      <button
                        type="submit"
                        disabled={
                          isSavingNote ||
                          !note.trim()
                        }
                        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSavingNote
                          ? 'שומר...'
                          : 'שמירת הערה'}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">
                          פעילות אחרונה
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                          אירועים משמעותיים בקשר עם הלקוח
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void loadContact()
                        }
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                      >
                        רענון
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActivityFilterButton
                        active={
                          activityFilter ===
                          'all'
                        }
                        label="הכול"
                        onClick={() => {
                          setActivityFilter(
                            'all'
                          );

                          setShowAllActivity(
                            false
                          );
                        }}
                      />

                      <ActivityFilterButton
                        active={
                          activityFilter ===
                          'whatsapp'
                        }
                        label="WhatsApp"
                        onClick={() => {
                          setActivityFilter(
                            'whatsapp'
                          );

                          setShowAllActivity(
                            false
                          );
                        }}
                      />

                      <ActivityFilterButton
                        active={
                          activityFilter ===
                          'appointments'
                        }
                        label="פגישות"
                        onClick={() => {
                          setActivityFilter(
                            'appointments'
                          );

                          setShowAllActivity(
                            false
                          );
                        }}
                      />

                      <ActivityFilterButton
                        active={
                          activityFilter ===
                          'notes'
                        }
                        label="הערות"
                        onClick={() => {
                          setActivityFilter(
                            'notes'
                          );

                          setShowAllActivity(
                            false
                          );
                        }}
                      />

                      <ActivityFilterButton
                        active={
                          activityFilter ===
                          'process'
                        }
                        label="תהליכים"
                        onClick={() => {
                          setActivityFilter(
                            'process'
                          );

                          setShowAllActivity(
                            false
                          );
                        }}
                      />
                    </div>
                  </div>

                  {displayedTimeline.length ===
                  0 ? (
                    <div className="p-10 text-center text-sm text-slate-500">
                      אין פעילות מתאימה לסינון שנבחר.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {displayedTimeline.map(
                        (
                          event
                        ) => (
                          <article
                            key={
                              event.eventId
                            }
                            className="flex gap-4 px-5 py-4 transition hover:bg-slate-50/70"
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
                              {timelineIcon(
                                event
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="mb-1 text-xs font-bold text-blue-600">
                                    {activityTypeLabel(
                                      event
                                    )}
                                  </div>

                                  <h3 className="font-bold text-slate-900">
                                    {event.title}
                                  </h3>
                                </div>

                                <time className="whitespace-nowrap text-xs text-slate-400">
                                  {formatDateTime(
                                    event.occurredAt
                                  )}
                                </time>
                              </div>

                              {event.description ? (
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                                  {event.description}
                                </p>
                              ) : null}

                              {event.status ===
                              'failed' ? (
                                <div className="mt-2 inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                                  הפעולה נכשלה
                                </div>
                              ) : null}

                              {event.status ===
                              'cancelled' ? (
                                <div className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                                  בוטל
                                </div>
                              ) : null}
                            </div>
                          </article>
                        )
                      )}
                    </div>
                  )}

                  {filteredTimeline.length >
                  ACTIVITY_PREVIEW_COUNT ? (
                    <div className="border-t border-slate-100 p-4 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          setShowAllActivity(
                            (
                              current
                            ) =>
                              !current
                          )
                        }
                        className="text-sm font-bold text-blue-700 hover:underline"
                      >
                        {showAllActivity
                          ? 'הצגת פעילות אחרונה בלבד'
                          : `הצגת כל הפעילות (${filteredTimeline.length})`}
                      </button>
                    </div>
                  ) : null}
                </section>
              </main>

              <aside className="space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="font-bold text-slate-900">
                    פרטי לקוח
                  </h2>

                  <div className="mt-5 space-y-4">
                    <DetailRow
                      label="טלפון"
                      value={
                        contact.phone
                      }
                      ltr
                    />

                    <DetailRow
                      label="אימייל"
                      value={
                        contact.email
                      }
                      ltr
                    />

                    <DetailRow
                      label="תעודת זהות"
                      value={
                        contact.idNumber
                      }
                    />

                    <DetailRow
                      label="תאריך לידה"
                      value={formatBirthDate(
                        contact.birthDate
                      )}
                    />

                    <DetailRow
                      label="מגדר"
                      value={
                        contact.gender
                      }
                    />

                    <DetailRow
                      label="מקור"
                      value={sourceLabel(
                        contact.sourceSystem
                      )}
                    />

                    <DetailRow
                      label="הסכמה לדיוור"
                      value={consentStatusLabel(
                        contact.consentStatus
                      )}
                    />
                  </div>
                </section>

                {visibleTags.length >
                0 ? (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="font-bold text-slate-900">
                      תגיות
                    </h2>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {visibleTags.map(
                        (
                          tag
                        ) => (
                          <span
                            key={
                              tag
                            }
                            className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                          >
                            {tag}
                          </span>
                        )
                      )}
                    </div>
                  </section>
                ) : null}

                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() =>
                      setShowSystemInfo(
                        (
                          current
                        ) =>
                          !current
                      )
                    }
                    className="flex w-full items-center justify-between gap-3 p-5 text-right"
                  >
                    <div>
                      <h2 className="font-bold text-slate-900">
                        מידע מערכת
                      </h2>

                      <p className="mt-1 text-xs text-slate-400">
                        מזהים, סנכרון ומידע טכני
                      </p>
                    </div>

                    <span className="text-slate-400">
                      {showSystemInfo
                        ? '▲'
                        : '▼'}
                    </span>
                  </button>

                  {showSystemInfo ? (
                    <div className="border-t border-slate-100 p-5">
                      <div className="space-y-4">
                        <DetailRow
                          label="נוצר"
                          value={formatDateTime(
                            contact.createdAt
                          )}
                        />

                        <DetailRow
                          label="עודכן"
                          value={formatDateTime(
                            contact.updatedAt
                          )}
                        />

                        <DetailRow
                          label="סנכרון אחרון"
                          value={formatDateTime(
                            contact.sourceLastSyncedAt
                          )}
                        />

                        {contact.sourceRecordId ? (
                          <DetailRow
                            label={
                              contact.sourceSystem ===
                              'surense'
                                ? 'מזהה לקוח ב־Surense'
                                : 'מזהה במערכת המקור'
                            }
                            value={
                              contact.sourceRecordId
                            }
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function StatusCard({
  icon,
  label,
  value,
  description,
}: {
  icon: string;
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
          {icon}
        </div>

        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-500">
            {label}
          </div>

          <div className="mt-1 truncate text-lg font-bold text-slate-900">
            {value}
          </div>

          {description ? (
            <div className="mt-1 line-clamp-2 text-xs text-slate-400">
              {description}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="text-xs font-semibold text-slate-500">
        {label}
      </div>

      <div className="mt-1 font-bold text-slate-800">
        {value ||
          '—'}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value:
    | string
    | null
    | undefined;
  ltr?: boolean;
}) {
  return (
    <div className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <div className="text-xs font-semibold text-slate-400">
        {label}
      </div>

      <div
        className="mt-1 break-words text-sm font-semibold text-slate-800"
        dir={
          ltr
            ? 'ltr'
            : undefined
        }
      >
        {value ||
          '—'}
      </div>
    </div>
  );
}

function ActivityFilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        'rounded-full px-3 py-1.5 text-xs font-bold transition',
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      ].join(' ')}
    >
      {label}
    </button>
  );
}