'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

import {
  httpsCallable,
} from 'firebase/functions';

import {
  db,
  functions,
} from '@/lib/firebase/firebase';

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
};

type CampaignResultItem = {
  contactId: string;
  ok: boolean;

  waMessageId?: string;
  conversationId?: string;

  error?: string;
};

type SendCampaignResponse = {
  ok: boolean;
  partialSuccess: boolean;

  agentId: string;
  campaignId: string;
  campaignName: string;

  templateName: string;

  received: number;
  sent: number;
  failed: number;

  status:
    | 'completed'
    | 'completed_with_errors'
    | 'failed';

  results: CampaignResultItem[];
};

type Props = {
  agentId: string;
  contactIds: string[];

  selectedContactName?: string | null;

  onClose: () => void;

  onSent:
    (
      result: SendCampaignResponse
    ) => void | Promise<void>;
};

function replaceTemplatePreview(
  bodyText: string,
  firstName: string
): string {
  return String(
    bodyText || ''
  ).replace(
    /\{\{1\}\}/g,
    firstName ||
      'שם הלקוח'
  );
}

export default function SendMagicTouchCampaignModal({
  agentId,
  contactIds,
  selectedContactName,
  onClose,
  onSent,
}: Props) {
  const [
    templates,
    setTemplates,
  ] =
    useState<
      WhatsAppTemplate[]
    >([]);

  const [
    selectedTemplateName,
    setSelectedTemplateName,
  ] =
    useState('');

  const [
    campaignName,
    setCampaignName,
  ] =
    useState('');

  const [
    isLoadingTemplates,
    setIsLoadingTemplates,
  ] =
    useState(true);

  const [
    isSending,
    setIsSending,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('');

  const [
    result,
    setResult,
  ] =
    useState<
      SendCampaignResponse | null
    >(null);

  useEffect(() => {
    if (!agentId) {
      setTemplates([]);
      setSelectedTemplateName('');
      setIsLoadingTemplates(false);
      return;
    }

    setIsLoadingTemplates(true);
    setErrorMessage('');

    const templatesQuery =
      query(
        collection(
          db,
          'agents',
          agentId,
          'whatsapp_templates'
        ),
        where(
          'status',
          '==',
          'APPROVED'
        )
      );

    const unsubscribe =
      onSnapshot(
        templatesQuery,
        (
          snapshot
        ) => {
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
                } satisfies WhatsAppTemplate;
              }
            );

          rows.sort(
            (
              first,
              second
            ) =>
              first.name.localeCompare(
                second.name
              )
          );

          setTemplates(
            rows
          );

          setSelectedTemplateName(
            (
              current
            ) => {
              if (
                current &&
                rows.some(
                  (
                    template
                  ) =>
                    template.name ===
                    current
                )
              ) {
                return current;
              }

              return (
                rows[0]?.name ||
                ''
              );
            }
          );

          setIsLoadingTemplates(
            false
          );
        },
        (
          error
        ) => {
          console.error(
            '[SendMagicTouchCampaignModal] Failed to load templates',
            error
          );

          setTemplates([]);
          setSelectedTemplateName('');
          setIsLoadingTemplates(
            false
          );

          setErrorMessage(
            error.message ||
              'לא ניתן היה לטעון את תבניות WhatsApp.'
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    agentId,
  ]);

  const selectedTemplate =
    useMemo(
      () =>
        templates.find(
          (
            template
          ) =>
            template.name ===
            selectedTemplateName
        ) ||
        null,
      [
        templates,
        selectedTemplateName,
      ]
    );

  const previewFirstName =
    useMemo(() => {
      const normalizedName =
        String(
          selectedContactName ||
            ''
        ).trim();

      if (normalizedName) {
        return (
          normalizedName
            .split(/\s+/)
            .filter(Boolean)[0] ||
          'שם הלקוח'
        );
      }

      return (
        selectedTemplate
          ?.bodyExamples
          ?.[0] ||
        'שם הלקוח'
      );
    }, [
      selectedContactName,
      selectedTemplate,
    ]);

  const templatePreview =
    selectedTemplate?.bodyText
      ? replaceTemplatePreview(
          selectedTemplate.bodyText,
          previewFirstName
        )
      : '';

  const handleSend =
    async () => {
      if (
        isSending ||
        result
      ) {
        return;
      }

      if (!agentId) {
        setErrorMessage(
          'לא נמצא סוכן פעיל.'
        );
        return;
      }

      if (
        contactIds.length ===
        0
      ) {
        setErrorMessage(
          'לא נבחרו אנשי קשר לשליחה.'
        );
        return;
      }

      if (
        !selectedTemplateName
      ) {
        setErrorMessage(
          'יש לבחור תבנית WhatsApp מאושרת.'
        );
        return;
      }

      const confirmed =
        window.confirm(
          `לשלוח את התבנית ל-${contactIds.length} אנשי קשר?`
        );

      if (!confirmed) {
        return;
      }

      setIsSending(true);
      setErrorMessage('');

      try {
        const fn =
          httpsCallable<
            {
              agentId: string;
              contactIds: string[];
              templateName: string;
              campaignName?: string;
            },
            SendCampaignResponse
          >(
            functions,
            'sendMagicTouchWhatsAppCampaign'
          );

        const response =
          await fn({
            agentId,

            contactIds,

            templateName:
              selectedTemplateName,

            campaignName:
              campaignName.trim() ||
              undefined,
          });

        setResult(
          response.data
        );

        await onSent(
          response.data
        );
      } catch (
        error: any
      ) {
        console.error(
          '[SendMagicTouchCampaignModal] Campaign failed',
          error
        );

        setErrorMessage(
          error?.message ||
            'שליחת הקמפיין נכשלה.'
        );
      } finally {
        setIsSending(false);
      }
    };

  const failedResults =
    result?.results?.filter(
      (
        item
      ) =>
        !item.ok
    ) ||
    [];

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="magic-touch-campaign-title"
      className="
        fixed
        inset-0
        z-[120]
        flex
        items-center
        justify-center
        bg-black/50
        p-4
      "
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
            event.currentTarget &&
          !isSending
        ) {
          onClose();
        }
      }}
    >
      <div
        className="
          max-h-[92vh]
          w-full
          max-w-2xl
          overflow-y-auto
          rounded-2xl
          bg-white
          shadow-2xl
        "
      >
        <header className="flex items-start justify-between border-b px-6 py-5">
          <div>
            <h2
              id="magic-touch-campaign-title"
              className="text-xl font-bold text-slate-900"
            >
              שליחת קמפיין WhatsApp
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              נבחרו{' '}
              <strong>
                {contactIds.length}
              </strong>{' '}
              אנשי קשר לשליחה.
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              isSending
            }
            className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="סגירת החלון"
          >
            ×
          </button>
        </header>

        <div className="space-y-5 p-6">
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {result ? (
            <section className="space-y-4">
              <div
                className={`rounded-xl border p-5 ${
                  result.failed ===
                  0
                    ? 'border-green-200 bg-green-50'
                    : result.sent >
                        0
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-red-200 bg-red-50'
                }`}
              >
                <h3 className="text-lg font-bold text-slate-900">
                  תוצאות השליחה
                </h3>

                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <div className="text-2xl font-bold text-slate-900">
                      {result.received}
                    </div>

                    <div className="text-xs text-slate-500">
                      נבחרו
                    </div>
                  </div>

                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <div className="text-2xl font-bold text-green-700">
                      {result.sent}
                    </div>

                    <div className="text-xs text-slate-500">
                      נשלחו
                    </div>
                  </div>

                  <div className="rounded-lg bg-white p-3 shadow-sm">
                    <div className="text-2xl font-bold text-red-700">
                      {result.failed}
                    </div>

                    <div className="text-xs text-slate-500">
                      נכשלו
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-sm text-slate-700">
                  מזהה קמפיין:{' '}
                  <span
                    dir="ltr"
                    className="font-mono text-xs"
                  >
                    {result.campaignId}
                  </span>
                </div>
              </div>

              {failedResults.length >
              0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <h3 className="font-bold text-red-800">
                    נמענים שלא נשלחו
                  </h3>

                  <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                    {failedResults.map(
                      (
                        item
                      ) => (
                        <div
                          key={
                            item.contactId
                          }
                          className="rounded-lg bg-white px-3 py-2 text-sm"
                        >
                          <div
                            dir="ltr"
                            className="font-mono text-xs text-slate-500"
                          >
                            {
                              item.contactId
                            }
                          </div>

                          <div className="mt-1 text-red-700">
                            {item.error ||
                              'השליחה נכשלה'}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end border-t pt-5">
                <button
                  type="button"
                  onClick={
                    onClose
                  }
                  className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
                >
                  סיום
                </button>
              </div>
            </section>
          ) : (
            <>
              <div>
                <label
                  htmlFor="magic-touch-campaign-name"
                  className="mb-1 block text-sm font-semibold text-slate-700"
                >
                  שם הקמפיין
                </label>

                <input
                  id="magic-touch-campaign-name"
                  type="text"
                  value={
                    campaignName
                  }
                  onChange={(
                    event
                  ) =>
                    setCampaignName(
                      event
                        .target
                        .value
                    )
                  }
                  disabled={
                    isSending
                  }
                  placeholder="לדוגמה: לקוחות ללא פעילות – אוגוסט"
                  className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-blue-500"
                />

                <p className="mt-1 text-xs text-slate-500">
                  השדה אינו חובה. אם יישאר ריק, ייווצר שם אוטומטי.
                </p>
              </div>

              <div>
                <label
                  htmlFor="magic-touch-campaign-template"
                  className="mb-1 block text-sm font-semibold text-slate-700"
                >
                  תבנית WhatsApp *
                </label>

                <select
                  id="magic-touch-campaign-template"
                  value={
                    selectedTemplateName
                  }
                  onChange={(
                    event
                  ) =>
                    setSelectedTemplateName(
                      event
                        .target
                        .value
                    )
                  }
                  disabled={
                    isSending ||
                    isLoadingTemplates ||
                    templates.length ===
                      0
                  }
                  className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-blue-500"
                >
                  {isLoadingTemplates ? (
                    <option value="">
                      טוען תבניות...
                    </option>
                  ) : templates.length ===
                    0 ? (
                    <option value="">
                      לא נמצאו תבניות מאושרות
                    </option>
                  ) : (
                    templates.map(
                      (
                        template
                      ) => (
                        <option
                          key={
                            template.id
                          }
                          value={
                            template.name
                          }
                        >
                          {template.name}
                        </option>
                      )
                    )
                  )}
                </select>

                {selectedTemplate ? (
                  <div className="mt-2 text-xs text-slate-500">
                    {selectedTemplate.category ||
                      'ללא קטגוריה'}
                    {' · '}
                    {selectedTemplate.language ||
                      'he'}
                  </div>
                ) : null}
              </div>

              {selectedTemplate?.bodyText ? (
                <section className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-700">
                    תצוגה מקדימה
                  </div>

                  <div className="mt-3 whitespace-pre-wrap rounded-lg border bg-white p-4 text-sm text-slate-800">
                    {templatePreview}
                  </div>

                  {selectedTemplate
                    .quickReplyButtons &&
                  selectedTemplate
                    .quickReplyButtons
                    .length >
                    0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedTemplate.quickReplyButtons.map(
                        (
                          buttonText
                        ) => (
                          <span
                            key={
                              buttonText
                            }
                            className="rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold text-blue-700"
                          >
                            {
                              buttonText
                            }
                          </span>
                        )
                      )}
                    </div>
                  ) : null}

                  {(selectedTemplate.bodyVariableCount ||
                    0) >
                  0 ? (
                    <p className="mt-3 text-xs text-slate-500">
                      לכל נמען יוזן השם הפרטי שלו במקום {'{{1}}'}.
                    </p>
                  ) : null}
                </section>
              ) : null}

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                השליחה תתחיל מיד לאחר האישור. ניתן לשלוח עד 100 אנשי קשר בכל קמפיין.
              </div>

              <div className="flex items-center justify-end gap-3 border-t pt-5">
                <button
                  type="button"
                  onClick={
                    onClose
                  }
                  disabled={
                    isSending
                  }
                  className="rounded-lg border px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  ביטול
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleSend()
                  }
                  disabled={
                    isSending ||
                    isLoadingTemplates ||
                    contactIds.length ===
                      0 ||
                    !selectedTemplateName
                  }
                  className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSending
                    ? 'שולח קמפיין...'
                    : `שליחה ל-${contactIds.length} אנשי קשר`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}