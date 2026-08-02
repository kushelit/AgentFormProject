'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  collection,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';

import {
  httpsCallable,
} from 'firebase/functions';

import {
  db,
  functions,
} from '@/lib/firebase/firebase';

import useFetchAgentData from '@/hooks/useFetchAgentData';

type WhatsAppTemplate = {
  id: string;
  name: string;

  category?: string | null;
  language?: string | null;
  status?: string | null;

  bodyText?: string | null;
  bodyVariableCount?: number;
  bodyExamples?: string[];

  quickReplyButtons?: string[];
  quickReplyActions?: Record<string, string>;

  updatedAt?: unknown;
};

type ToastKind =
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

type ToastState = {
  type: ToastKind;
  title: string;
  message: string;
};

type CreateTemplateResponse = {
  ok?: boolean;
  name?: string;
  status?: string;
};

type RefreshTemplatesResponse = {
  ok?: boolean;
  count?: number;
};

function getTemplateVariableNumbers(
  value: string
): number[] {
  const matches =
    Array.from(
      value.matchAll(
        /\{\{(\d+)\}\}/g
      )
    );

  return Array.from(
    new Set(
      matches
        .map(
          (match) =>
            Number(
              match[1]
            )
        )
        .filter(
          (number) =>
            Number.isInteger(
              number
            ) &&
            number > 0
        )
    )
  ).sort(
    (first, second) =>
      first - second
  );
}

function normalizeTemplateName(
  value: string
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function formatTemplateStatus(
  status?: string | null
): string {
  switch (
    String(
      status || ''
    ).toUpperCase()
  ) {
    case 'APPROVED':
      return 'מאושרת';

    case 'PENDING':
    case 'PENDING_REVIEW':
      return 'ממתינה לאישור';

    case 'REJECTED':
      return 'נדחתה';

    case 'PAUSED':
      return 'מושהית';

    case 'DISABLED':
      return 'לא פעילה';

    default:
      return status || 'לא ידוע';
  }
}

function getStatusClasses(
  status?: string | null
): string {
  switch (
    String(
      status || ''
    ).toUpperCase()
  ) {
    case 'APPROVED':
      return 'border-green-200 bg-green-50 text-green-700';

    case 'PENDING':
    case 'PENDING_REVIEW':
      return 'border-amber-200 bg-amber-50 text-amber-700';

    case 'REJECTED':
      return 'border-red-200 bg-red-50 text-red-700';

    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function replaceTemplatePreview(
  bodyText: string,
  exampleValue: string
): string {
  return String(
    bodyText || ''
  ).replace(
    /\{\{1\}\}/g,
    exampleValue ||
      'שם הלקוח'
  );
}

export default function MagicTouchTemplatesPage() {
  const {
    selectedAgentId,
  } =
    useFetchAgentData();

  const agentId =
    selectedAgentId;

  const [
    templates,
    setTemplates,
  ] =
    useState<
      WhatsAppTemplate[]
    >([]);

  const [
    templateName,
    setTemplateName,
  ] =
    useState('');

  const [
    category,
    setCategory,
  ] =
    useState('UTILITY');

  const [
    language,
    setLanguage,
  ] =
    useState('he');

  const [
    bodyText,
    setBodyText,
  ] =
    useState('');

  const [
    exampleValue,
    setExampleValue,
  ] =
    useState('');

  const [
    quickReply1,
    setQuickReply1,
  ] =
    useState('');

  const [
    quickReply1Action,
    setQuickReply1Action,
  ] =
    useState('interested');

  const [
    quickReply2,
    setQuickReply2,
  ] =
    useState('');

  const [
    quickReply2Action,
    setQuickReply2Action,
  ] =
    useState('declined');

  const [
    isLoadingTemplates,
    setIsLoadingTemplates,
  ] =
    useState(true);

  const [
    isRefreshing,
    setIsRefreshing,
  ] =
    useState(false);

  const [
    isCreating,
    setIsCreating,
  ] =
    useState(false);

  const [
    toast,
    setToast,
  ] =
    useState<
      ToastState | null
    >(null);

  const showToast =
    useCallback(
      (
        nextToast:
          ToastState
      ) => {
        setToast(
          nextToast
        );

        window.setTimeout(
          () => {
            setToast(
              null
            );
          },
          4500
        );
      },
      []
    );

  const loadTemplates =
    useCallback(
      async () => {
        if (!agentId) {
          setTemplates([]);
          setIsLoadingTemplates(false);
          return;
        }

        setIsLoadingTemplates(true);

        try {
          const templatesQuery =
            query(
              collection(
                db,
                'agents',
                agentId,
                'whatsapp_templates'
              ),
              orderBy(
                'updatedAt',
                'desc'
              )
            );

          const snapshot =
            await getDocs(
              templatesQuery
            );

          const rows =
            snapshot.docs.map(
              (
                templateDoc
              ) => {
                const data =
                  templateDoc.data() as any;

                return {
                  id:
                    templateDoc.id,

                  name:
                    String(
                      data?.name ||
                        templateDoc.id
                    ),

                  category:
                    data?.category ||
                    null,

                  language:
                    data?.language ||
                    null,

                  status:
                    data?.status ||
                    null,

                  bodyText:
                    data?.bodyText ||
                    null,

                  bodyVariableCount:
                    Number(
                      data?.bodyVariableCount ||
                        0
                    ),

                  bodyExamples:
                    Array.isArray(
                      data?.bodyExamples
                    )
                      ? data.bodyExamples.map(
                          (
                            value: unknown
                          ) =>
                            String(
                              value
                            )
                        )
                      : [],

                  quickReplyButtons:
                    Array.isArray(
                      data?.quickReplyButtons
                    )
                      ? data.quickReplyButtons.map(
                          (
                            value: unknown
                          ) =>
                            String(
                              value
                            )
                        )
                      : [],

                  quickReplyActions:
                    data?.quickReplyActions &&
                    typeof data.quickReplyActions ===
                      'object' &&
                    !Array.isArray(
                      data.quickReplyActions
                    )
                      ? data.quickReplyActions
                      : {},

                  updatedAt:
                    data?.updatedAt,
                } satisfies WhatsAppTemplate;
              }
            );

          setTemplates(
            rows
          );
        } catch (
          error: any
        ) {
          console.error(
            '[MagicTouchTemplatesPage] Failed to load templates',
            error
          );

          setTemplates([]);

          showToast({
            type:
              'error',

            title:
              'שגיאה בטעינת התבניות',

            message:
              error?.message ||
              'לא ניתן היה לטעון את תבניות WhatsApp.',
          });
        } finally {
          setIsLoadingTemplates(
            false
          );
        }
      },
      [
        agentId,
        showToast,
      ]
    );

  useEffect(() => {
    void loadTemplates();
  }, [
    loadTemplates,
  ]);

  const variableNumbers =
    useMemo(
      () =>
        getTemplateVariableNumbers(
          bodyText
        ),
      [
        bodyText,
      ]
    );

  const hasFirstVariable =
    variableNumbers.includes(
      1
    );

  const previewText =
    useMemo(
      () =>
        replaceTemplatePreview(
          bodyText,
          exampleValue ||
            'ישראל'
        ),
      [
        bodyText,
        exampleValue,
      ]
    );

  const resetForm =
    () => {
      setTemplateName('');
      setCategory('UTILITY');
      setLanguage('he');
      setBodyText('');
      setExampleValue('');
      setQuickReply1('');
      setQuickReply1Action(
        'interested'
      );
      setQuickReply2('');
      setQuickReply2Action(
        'declined'
      );
    };

  const fillRecommendedButtons =
    () => {
      setQuickReply1(
        'כן, אשמח'
      );

      setQuickReply1Action(
        'interested'
      );

      setQuickReply2(
        'לא מעוניין'
      );

      setQuickReply2Action(
        'declined'
      );
    };

  const handleCreateTemplate =
    async () => {
      if (
        !agentId ||
        isCreating
      ) {
        return;
      }

      const normalizedName =
        normalizeTemplateName(
          templateName
        );

      const normalizedBody =
        bodyText.trim();

      if (
        !normalizedName ||
        !normalizedBody
      ) {
        showToast({
          type:
            'warning',

          title:
            'חסרים נתונים',

          message:
            'יש להזין שם תבנית ותוכן הודעה.',
        });

        return;
      }

      if (
        normalizedName !==
        templateName.trim()
      ) {
        setTemplateName(
          normalizedName
        );
      }

      if (
        variableNumbers.length >
          0 &&
        (
          variableNumbers.length !==
            1 ||
          variableNumbers[0] !==
            1
        )
      ) {
        showToast({
          type:
            'warning',

          title:
            'משתנים לא תקינים',

          message:
            'בשלב זה ניתן להשתמש רק במשתנה {{1}} עבור שם הלקוח.',
        });

        return;
      }

      if (
        hasFirstVariable &&
        !exampleValue.trim()
      ) {
        showToast({
          type:
            'warning',

          title:
            'חסרה דוגמה למשתנה',

          message:
            'התבנית כוללת את {{1}}. יש להזין דוגמה, למשל: ישראל.',
        });

        return;
      }

      const normalizedQuickReply1 =
        quickReply1.trim();

      const normalizedQuickReply2 =
        quickReply2.trim();

      if (
        normalizedQuickReply1 &&
        normalizedQuickReply2 &&
        normalizedQuickReply1 ===
          normalizedQuickReply2
      ) {
        showToast({
          type:
            'warning',

          title:
            'כפתורים זהים',

          message:
            'יש להזין טקסט שונה לכל כפתור תגובה.',
        });

        return;
      }

      const quickReplyButtons =
        [
          normalizedQuickReply1,
          normalizedQuickReply2,
        ].filter(
          Boolean
        );

      const quickReplyActions:
        Record<string, string> = {};

      if (
        normalizedQuickReply1
      ) {
        quickReplyActions[
          normalizedQuickReply1
        ] =
          quickReply1Action;
      }

      if (
        normalizedQuickReply2
      ) {
        quickReplyActions[
          normalizedQuickReply2
        ] =
          quickReply2Action;
      }

      setIsCreating(
        true
      );

      try {
        const fn =
          httpsCallable<
            {
              agentId: string;
              name: string;
              category: string;
              language: string;
              bodyText: string;
              bodyExamples: string[];
              quickReplyButtons: string[];
              quickReplyActions: Record<string, string>;
            },
            CreateTemplateResponse
          >(
            functions,
            'createWhatsAppTemplate'
          );

        const response =
          await fn({
            agentId,

            name:
              normalizedName,

            category,

            language,

            bodyText:
              normalizedBody,

            bodyExamples:
              hasFirstVariable
                ? [
                    exampleValue.trim(),
                  ]
                : [],

            quickReplyButtons,

            quickReplyActions,
          });

        showToast({
          type:
            'success',

          title:
            'התבנית נשלחה ל־Meta',

          message:
            `התבנית ${
              response.data?.name ||
              normalizedName
            } נוצרה בסטטוס ${
              response.data?.status ||
              'PENDING'
            }.`,
        });

        resetForm();

        await loadTemplates();
      } catch (
        error: any
      ) {
        console.error(
          '[MagicTouchTemplatesPage] Failed to create template',
          error
        );

        showToast({
          type:
            'error',

          title:
            'יצירת התבנית נכשלה',

          message:
            error?.message ||
            'לא ניתן היה ליצור את התבנית.',
        });
      } finally {
        setIsCreating(
          false
        );
      }
    };

  const handleRefreshTemplates =
    async () => {
      if (
        !agentId ||
        isRefreshing
      ) {
        return;
      }

      setIsRefreshing(
        true
      );

      try {
        const fn =
          httpsCallable<
            {
              agentId: string;
            },
            RefreshTemplatesResponse
          >(
            functions,
            'refreshWhatsAppTemplates'
          );

        const response =
          await fn({
            agentId,
          });

        await loadTemplates();

        showToast({
          type:
            'success',

          title:
            'התבניות עודכנו',

          message:
            `עודכנו ${
              response.data?.count ??
              0
            } תבניות מ־Meta.`,
        });
      } catch (
        error: any
      ) {
        console.error(
          '[MagicTouchTemplatesPage] Failed to refresh templates',
          error
        );

        showToast({
          type:
            'error',

          title:
            'רענון התבניות נכשל',

          message:
            error?.message ||
            'לא ניתן היה לרענן את התבניות מ־Meta.',
        });
      } finally {
        setIsRefreshing(
          false
        );
      }
    };

  return (
    <section
      dir="rtl"
      className="w-full"
    >
      {toast ? (
        <div
          className={`
            fixed
            left-6
            top-20
            z-[200]
            w-[min(420px,calc(100vw-3rem))]
            rounded-xl
            border
            bg-white
            p-4
            shadow-2xl
            ${
              toast.type ===
              'success'
                ? 'border-green-300'
                : toast.type ===
                    'error'
                  ? 'border-red-300'
                  : toast.type ===
                      'warning'
                    ? 'border-amber-300'
                    : 'border-blue-300'
            }
          `}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-bold text-slate-900">
                {toast.title}
              </div>

              <div className="mt-1 text-sm text-slate-600">
                {toast.message}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setToast(
                  null
                )
              }
              className="text-xl text-slate-400 hover:text-slate-700"
              aria-label="סגירת הודעה"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-medium text-blue-700">
              Magic Touch
            </div>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              תבניות WhatsApp
            </h1>

            <p className="mt-2 text-slate-600">
              יצירת תבניות, ניהול כפתורי תגובה ובדיקת סטטוס האישור מול Meta.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void handleRefreshTemplates()
            }
            disabled={
              !agentId ||
              isRefreshing
            }
            className="rounded-lg border bg-white px-4 py-2.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRefreshing
              ? 'מרענן מ־Meta...'
              : 'רענון תבניות מ־Meta'}
          </button>
        </header>

        {!agentId ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            לא נמצא סוכן פעיל.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              יצירת תבנית חדשה
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              התבנית תישלח לאישור Meta לפני שניתן יהיה להשתמש בה.
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <label
                  htmlFor="template-name"
                  className="mb-1 block text-sm font-semibold text-slate-700"
                >
                  שם תבנית *
                </label>

                <input
                  id="template-name"
                  type="text"
                  value={
                    templateName
                  }
                  onChange={(
                    event
                  ) =>
                    setTemplateName(
                      event.target.value
                    )
                  }
                  onBlur={() =>
                    setTemplateName(
                      normalizeTemplateName(
                        templateName
                      )
                    )
                  }
                  placeholder="meir_reengagement_quick_reply"
                  className="w-full rounded-lg border px-3 py-2.5 font-mono outline-none focus:border-blue-500"
                />

                <p className="mt-1 text-xs text-slate-500">
                  אותיות אנגלית קטנות, מספרים וקו תחתון בלבד.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="template-category"
                    className="mb-1 block text-sm font-semibold text-slate-700"
                  >
                    קטגוריה
                  </label>

                  <select
                    id="template-category"
                    value={
                      category
                    }
                    onChange={(
                      event
                    ) =>
                      setCategory(
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border px-3 py-2.5"
                  >
                    <option value="UTILITY">
                      UTILITY
                    </option>

                    <option value="MARKETING">
                      MARKETING
                    </option>

                    <option value="AUTHENTICATION">
                      AUTHENTICATION
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="template-language"
                    className="mb-1 block text-sm font-semibold text-slate-700"
                  >
                    שפה
                  </label>

                  <select
                    id="template-language"
                    value={
                      language
                    }
                    onChange={(
                      event
                    ) =>
                      setLanguage(
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border px-3 py-2.5"
                  >
                    <option value="he">
                      עברית (he)
                    </option>

                    <option value="en">
                      English (en)
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="template-body"
                  className="mb-1 block text-sm font-semibold text-slate-700"
                >
                  תוכן התבנית *
                </label>

                <textarea
                  id="template-body"
                  value={
                    bodyText
                  }
                  onChange={(
                    event
                  ) =>
                    setBodyText(
                      event.target.value
                    )
                  }
                  rows={7}
                  placeholder={`שלום {{1}},
עבר זמן מאז שיצרנו קשר ורציתי לבדוק האם תרצה שנקבע שיחה קצרה.`}
                  className="w-full resize-y rounded-lg border px-3 py-3 outline-none focus:border-blue-500"
                />

                <div className="mt-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  ניתן לשלב שם פרטי באמצעות{' '}
                  <span className="font-mono font-bold">
                    {'{{1}}'}
                  </span>
                  .
                </div>
              </div>

              {hasFirstVariable ? (
                <div>
                  <label
                    htmlFor="template-example"
                    className="mb-1 block text-sm font-semibold text-slate-700"
                  >
                    דוגמה למשתנה {'{{1}}'} *
                  </label>

                  <input
                    id="template-example"
                    type="text"
                    value={
                      exampleValue
                    }
                    onChange={(
                      event
                    ) =>
                      setExampleValue(
                        event.target.value
                      )
                    }
                    placeholder="ישראל"
                    className="w-full rounded-lg border px-3 py-2.5"
                  />
                </div>
              ) : null}

              <section className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      כפתורי תגובה מהירה
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      הטקסט מוצג ללקוח, והפעולה משמשת את מנוע ה־Flow.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      fillRecommendedButtons
                    }
                    className="rounded-lg border px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                  >
                    מילוי כפתורים מומלצים
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        טקסט כפתור 1
                      </label>

                      <input
                        type="text"
                        value={
                          quickReply1
                        }
                        onChange={(
                          event
                        ) =>
                          setQuickReply1(
                            event.target.value
                          )
                        }
                        placeholder="כן, אשמח"
                        className="w-full rounded-lg border px-3 py-2.5"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        פעולה
                      </label>

                      <select
                        value={
                          quickReply1Action
                        }
                        onChange={(
                          event
                        ) =>
                          setQuickReply1Action(
                            event.target.value
                          )
                        }
                        className="w-full rounded-lg border px-3 py-2.5"
                      >
                        <option value="interested">
                          מעוניין
                        </option>

                        <option value="declined">
                          לא מעוניין
                        </option>

                        <option value="booking">
                          קביעת פגישה
                        </option>

                        <option value="other">
                          פעולה אחרת
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        טקסט כפתור 2
                      </label>

                      <input
                        type="text"
                        value={
                          quickReply2
                        }
                        onChange={(
                          event
                        ) =>
                          setQuickReply2(
                            event.target.value
                          )
                        }
                        placeholder="לא מעוניין"
                        className="w-full rounded-lg border px-3 py-2.5"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600">
                        פעולה
                      </label>

                      <select
                        value={
                          quickReply2Action
                        }
                        onChange={(
                          event
                        ) =>
                          setQuickReply2Action(
                            event.target.value
                          )
                        }
                        className="w-full rounded-lg border px-3 py-2.5"
                      >
                        <option value="declined">
                          לא מעוניין
                        </option>

                        <option value="interested">
                          מעוניין
                        </option>

                        <option value="booking">
                          קביעת פגישה
                        </option>

                        <option value="other">
                          פעולה אחרת
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <button
                type="button"
                onClick={() =>
                  void handleCreateTemplate()
                }
                disabled={
                  !agentId ||
                  isCreating ||
                  !templateName.trim() ||
                  !bodyText.trim()
                }
                className="w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating
                  ? 'יוצר תבנית...'
                  : 'שליחת התבנית לאישור Meta'}
              </button>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-900">
                תצוגה מקדימה
              </h2>

              <div className="mt-4 rounded-2xl bg-[#efeae2] p-4">
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="whitespace-pre-wrap text-sm text-slate-800">
                    {previewText ||
                      'תוכן התבנית יוצג כאן.'}
                  </div>

                  {quickReply1 ||
                  quickReply2 ? (
                    <div className="mt-4 divide-y border-t">
                      {quickReply1 ? (
                        <div className="py-2 text-center text-sm font-semibold text-blue-600">
                          {quickReply1}
                        </div>
                      ) : null}

                      {quickReply2 ? (
                        <div className="py-2 text-center text-sm font-semibold text-blue-600">
                          {quickReply2}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Meta עשויה לשנות את קטגוריית התבנית בהתאם לתוכן. יש לוודא שהנוסח אכן מתאים ל־UTILITY לפני שליחתו.
            </section>
          </aside>
        </div>

        <section className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                תבניות קיימות
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {templates.length} תבניות שמורות
              </p>
            </div>
          </div>

          {isLoadingTemplates ? (
            <div className="p-8 text-center text-slate-500">
              טוען תבניות...
            </div>
          ) : templates.length ===
            0 ? (
            <div className="p-8 text-center text-slate-500">
              עדיין אין תבניות להצגה.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3">
                      שם
                    </th>

                    <th className="px-4 py-3">
                      קטגוריה
                    </th>

                    <th className="px-4 py-3">
                      שפה
                    </th>

                    <th className="px-4 py-3">
                      סטטוס
                    </th>

                    <th className="px-4 py-3">
                      תוכן
                    </th>

                    <th className="px-4 py-3">
                      כפתורים
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {templates.map(
                    (
                      template
                    ) => (
                      <tr
                        key={
                          template.id
                        }
                        className="hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {template.name}
                        </td>

                        <td className="px-4 py-3">
                          {template.category ||
                            '—'}
                        </td>

                        <td className="px-4 py-3">
                          {template.language ||
                            '—'}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(
                              template.status
                            )}`}
                          >
                            {formatTemplateStatus(
                              template.status
                            )}
                          </span>
                        </td>

                        <td className="max-w-sm px-4 py-3">
                          <div className="line-clamp-2 whitespace-pre-wrap text-slate-600">
                            {template.bodyText ||
                              '—'}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {template
                            .quickReplyButtons
                            ?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {template.quickReplyButtons.map(
                                (
                                  button
                                ) => (
                                  <span
                                    key={
                                      button
                                    }
                                    className="rounded border bg-slate-50 px-2 py-1 text-xs"
                                  >
                                    {button}
                                  </span>
                                )
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}