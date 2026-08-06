'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';
import {
  useParams,
  useSearchParams,
} from 'next/navigation';

import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/firebase';
import { useMagicTouchAgent } from '@/components/MagicTouch/MagicTouchAgentContext';

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
      dateStyle: 'short',
    }
  ).format(parsed);
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

function timelineIcon(
  event: TimelineEvent
): string {
  switch (event.type) {
    case 'note_added':
      return '📝';

    case 'whatsapp_template_sent':
    case 'whatsapp_message_sent':
      return '📤';

    case 'whatsapp_received':
      return '📥';

    case 'booking_link_sent':
      return '🔗';

    case 'appointment_booked':
      return '📅';

    case 'appointment_cancelled':
      return '❌';

    case 'interest_updated':
      return '⭐';

    case 'contact_created':
      return '👤';

    default:
      return '•';
  }
}

function timelineStatusLabel(
  status: string
): string {
  switch (status) {
    case 'pending':
      return 'ממתין';

    case 'failed':
      return 'נכשל';

    case 'cancelled':
      return 'בוטל';

    default:
      return 'הושלם';
  }
}

export default function MagicTouchContactDetailsPage() {
  const params =
    useParams<{
      contactId: string;
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
      MagicTouchContact | null
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
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('');

  const [
    note,
    setNote,
  ] =
    useState('');

  const [
    isSavingNote,
    setIsSavingNote,
  ] =
    useState(false);

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState('');

  const loadContact =
    useCallback(
      async () => {
        if (
          !agentId ||
          !contactId
        ) {
          setContact(null);
          setTimeline([]);
          setIsLoading(false);

          setErrorMessage(
            'לא נמצאו פרטי סוכן או איש קשר.'
          );

          return;
        }

        setIsLoading(true);
        setErrorMessage('');

        try {
          const fn =
            httpsCallable<
              {
                agentId: string;
                contactId: string;
                timelineLimit: number;
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

          setContact(null);
          setTimeline([]);

          setErrorMessage(
            error?.message ||
              'לא ניתן היה לטעון את פרטי איש הקשר.'
          );
        } finally {
          setIsLoading(false);
        }
      },
      [
        agentId,
        contactId,
      ]
    );

  useEffect(() => {
    void loadContact();
  }, [
    loadContact,
  ]);

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

      setIsSavingNote(true);
      setErrorMessage('');
      setSuccessMessage('');

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

        setNote('');

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
        setIsSavingNote(false);
      }
    };

  const reengagement =
    contact?.engagement
      ?.reengagement;

  const displayedInterestStatus =
    String(
      reengagement
        ?.interestStatus ||
      contact?.interestStatus ||
      ''
    );

  const displayedBookingStatus =
    String(
      reengagement
        ?.bookingStatus ||
      contact?.appointmentStatus ||
      ''
    );

  const displayedProcessStatus =
    String(
      reengagement
        ?.status ||
      ''
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
      className="w-full"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <Link
            href="/MagicTouch/Contacts"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
          >
            <span>
              ←
            </span>

            <span>
              חזרה לאנשי קשר
            </span>
          </Link>

          <div className="mt-4">
            <div className="text-sm font-medium text-blue-700">
              Magic Touch
            </div>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              {contact
                ?.fullName ||
                'פרטי איש קשר'}
            </h1>

            <p className="mt-2 text-slate-600">
              פרטי הלקוח והיסטוריית הפעילות מולו.
            </p>
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

        {!contact ? (
          <div className="rounded-xl border bg-white p-8 text-center text-slate-500 shadow-sm">
            איש הקשר לא נמצא.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="space-y-5">
              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-bold text-slate-900">
                  פרטי איש קשר
                </h2>

                <div className="space-y-4 text-sm">
                  <div>
                    <div className="text-slate-500">
                      שם מלא
                    </div>

                    <div className="mt-1 font-medium text-slate-900">
                      {contact.fullName ||
                        '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      טלפון
                    </div>

                    <div
                      className="mt-1 font-medium text-slate-900"
                      dir="ltr"
                    >
                      {contact.phone ||
                        '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      אימייל
                    </div>

                    <div
                      className="mt-1 break-all font-medium text-slate-900"
                      dir="ltr"
                    >
                      {contact.email ||
                        '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      תעודת זהות
                    </div>

                    <div className="mt-1 font-medium text-slate-900">
                      {contact.idNumber ||
                        '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      תאריך לידה
                    </div>

                    <div className="mt-1 font-medium text-slate-900">
                      {formatBirthDate(
                        contact.birthDate
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      מגדר
                    </div>

                    <div className="mt-1 font-medium text-slate-900">
                      {contact.gender ||
                        '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      מקור
                    </div>

                    <div className="mt-1 font-medium text-slate-900">
                      {sourceLabel(
                        contact.sourceSystem
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      מזהה במקור
                    </div>

                    <div className="mt-1 break-all font-medium text-slate-900">
                      {contact.sourceRecordId ||
                        '—'}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-bold text-slate-900">
                  מצב התהליך
                </h2>

                <div className="space-y-4 text-sm">
                  <div>
                    <div className="text-slate-500">
                      סטטוס תהליך חידוש קשר
                    </div>

                    <div className="mt-1 font-medium text-slate-900">
                      {processStatusLabel(
                        displayedProcessStatus
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      סטטוס עניין
                    </div>

                    <div className="mt-1 font-medium text-slate-900">
                      {interestLabel(
                        displayedInterestStatus
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      סטטוס פגישה
                    </div>

                    <div className="mt-1 font-medium text-slate-900">
                      {appointmentLabel(
                        displayedBookingStatus
                      )}
                    </div>
                  </div>

                  {reengagement?.bookingServiceName ? (
                    <div>
                      <div className="text-slate-500">
                        שירות הפגישה
                      </div>

                      <div className="mt-1 font-medium text-slate-900">
                        {reengagement.bookingServiceName}
                      </div>
                    </div>
                  ) : null}

                  {reengagement?.bookingStartAt ? (
                    <div>
                      <div className="text-slate-500">
                        מועד הפגישה
                      </div>

                      <div className="mt-1 font-medium text-slate-900">
                        {formatDateTime(
                          reengagement.bookingStartAt
                        )}
                      </div>
                    </div>
                  ) : null}

                  {reengagement?.bookingCancelledAt ? (
                    <div>
                      <div className="text-slate-500">
                        מועד ביטול הפגישה
                      </div>

                      <div className="mt-1 font-medium text-slate-900">
                        {formatDateTime(
                          reengagement.bookingCancelledAt
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="border-t pt-4">
                    <div className="text-slate-500">
                      סטטוס איש קשר
                    </div>

                    <div className="mt-1 font-medium text-slate-900">
                      {contact.contactStatus ||
                        '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      הסכמה לדיוור
                    </div>

                    <div className="mt-1 font-medium text-slate-900">
                      {contact.consentStatus ||
                        '—'}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-bold text-slate-900">
                  תגיות
                </h2>

                {Array.isArray(
                  contact.tags
                ) &&
                contact.tags
                  .length >
                  0 ? (
                  <div className="flex flex-wrap gap-2">
                    {contact.tags.map(
                      (
                        tag
                      ) => (
                        <span
                          key={
                            tag
                          }
                          className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                        >
                          {
                            tag
                          }
                        </span>
                      )
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">
                    אין תגיות.
                  </div>
                )}
              </section>

              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-bold text-slate-900">
                  מידע נוסף
                </h2>

                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-slate-500">
                      נוצר
                    </div>

                    <div className="mt-1">
                      {formatDateTime(
                        contact.createdAt
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      עודכן
                    </div>

                    <div className="mt-1">
                      {formatDateTime(
                        contact.updatedAt
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-500">
                      סנכרון אחרון מהמקור
                    </div>

                    <div className="mt-1">
                      {formatDateTime(
                        contact.sourceLastSyncedAt
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </aside>

            <main className="space-y-6">
              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">
                  הוספת הערה
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  ההערה תישמר גם ב־Timeline של איש הקשר.
                </p>

                <form
                  onSubmit={
                    handleAddNote
                  }
                  className="mt-4"
                >
                  <textarea
                    value={note}
                    onChange={(
                      event
                    ) =>
                      setNote(
                        event
                          .target
                          .value
                      )
                    }
                    disabled={
                      isSavingNote
                    }
                    rows={4}
                    maxLength={5000}
                    placeholder="לדוגמה: הלקוח ביקש לחזור אליו ביום ראשון..."
                    className="w-full resize-y rounded-lg border px-4 py-3 outline-none focus:border-blue-500"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      {note.length}
                      /5000
                    </div>

                    <button
                      type="submit"
                      disabled={
                        isSavingNote ||
                        !note.trim()
                      }
                      className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSavingNote
                        ? 'שומר...'
                        : 'הוספת הערה'}
                    </button>
                  </div>
                </form>
              </section>

              <section className="rounded-xl border bg-white shadow-sm">
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      היסטוריית פעילות
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      כל הפעולות מול איש הקשר במקום אחד.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void loadContact()
                    }
                    disabled={
                      isLoading
                    }
                    className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    רענון
                  </button>
                </div>

                {timeline.length ===
                0 ? (
                  <div className="p-8 text-center text-slate-500">
                    עדיין אין פעילות להצגה.
                  </div>
                ) : (
                  <div className="divide-y">
                    {timeline.map(
                      (
                        event
                      ) => (
                        <article
                          key={
                            event.eventId
                          }
                          className="flex gap-4 px-5 py-4"
                        >
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">
                            {timelineIcon(
                              event
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <h3 className="font-semibold text-slate-900">
                                {event.title}
                              </h3>

                              <time className="text-xs text-slate-500">
                                {formatDateTime(
                                  event.occurredAt
                                )}
                              </time>
                            </div>

                            {event.description ? (
                              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                                {event.description}
                              </p>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                {event.channel}
                              </span>

                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                {timelineStatusLabel(
                                  event.status
                                )}
                              </span>

                              {event.direction ? (
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                  {event.direction}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      )
                    )}
                  </div>
                )}
              </section>
            </main>
          </div>
        )}
      </div>
    </section>
  );
}