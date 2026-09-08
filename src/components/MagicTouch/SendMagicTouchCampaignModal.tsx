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

  headerMedia?: {
    type: 'DOCUMENT' | 'IMAGE';
    storagePath?: string;
    fileName: string;
    mimeType: string;
    size: number;
  } | null;
};

export type MagicTouchCampaignSummary = {
  campaignId: string;
  agentId: string;
  name: string;
  channel: string;
  templateName: string;
  templateLanguage?: string | null;
  status: string;
  lastBatchStatus?: string | null;
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  processedCount: number;
  createdBy?: string | null;
  createdByName?: string | null;
  startedAt?: number | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  lastBatchCompletedAt?: number | null;
  completedAt?: number | null;
};

type CampaignResultItem = {
  contactId: string;
  ok: boolean;

  skipped?: boolean;
  skipReason?: string;

  waMessageId?: string;
  conversationId?: string;

  error?: string;
};

export type SendCampaignResponse = {
  ok: boolean;
  partialSuccess: boolean;

  agentId: string;
  campaignId: string;
  campaignName: string;

  templateName: string;

  received: number;
  added?: number;
  skipped?: number;
  sent: number;
  failed: number;

  totalContacts?: number;
  totalSent?: number;
  totalFailed?: number;
  totalProcessed?: number;

  status:
    | 'completed'
    | 'completed_with_errors'
    | 'failed';

  campaignStatus?: string;
  lastBatchStatus?: string;

  results: CampaignResultItem[];
};

type Props = {
  agentId: string;
  contactIds: string[];

  campaigns: MagicTouchCampaignSummary[];
  preselectedCampaignId?: string | null;

  selectedContactName?: string | null;

  onClose: () => void;

  onSent:
    (
      result: SendCampaignResponse
    ) => void | Promise<void>;
};

type SendMode =
  | 'existing'
  | 'new';

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

function campaignStatusLabel(
  status: string
): string {
  switch (
    status
  ) {
    case 'active':
      return 'פעיל';

    case 'completed':
      return 'היסטורי';

    case 'completed_with_errors':
      return 'היסטורי עם שגיאות';

    case 'failed':
      return 'נכשל בעבר';

    case 'archived':
      return 'בארכיון';

    default:
      return status ||
        'פעיל';
  }
}

function shortCampaignId(
  campaignId: string
): string {
  if (
    campaignId.length <=
    8
  ) {
    return campaignId;
  }

  return campaignId.slice(
    0,
    8
  );
}

export default function SendMagicTouchCampaignModal({
  agentId,
  contactIds,
  campaigns,
  preselectedCampaignId,
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
    sendMode,
    setSendMode,
  ] =
    useState<SendMode>(
      preselectedCampaignId
        ? 'existing'
        : 'new'
    );

  const [
    selectedCampaignId,
    setSelectedCampaignId,
  ] =
    useState(
      preselectedCampaignId ||
        ''
    );

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

  const [
    isConfirming,
    setIsConfirming,
  ] =
    useState(false);

  const [
    templateSearch,
    setTemplateSearch,
  ] =
    useState('');

  const availableCampaigns =
    useMemo(
      () =>
        campaigns
          .filter(
            (
              campaign
            ) =>
              campaign.status !==
              'archived'
          )
          .sort(
            (
              first,
              second
            ) => {
              const firstActive =
                first.status ===
                'active'
                  ? 1
                  : 0;

              const secondActive =
                second.status ===
                'active'
                  ? 1
                  : 0;

              if (
                firstActive !==
                secondActive
              ) {
                return (
                  secondActive -
                  firstActive
                );
              }

              return (
                Number(
                  second.updatedAt ||
                    second.createdAt ||
                    0
                ) -
                Number(
                  first.updatedAt ||
                    first.createdAt ||
                    0
                )
              );
            }
          ),
      [
        campaigns,
      ]
    );

  useEffect(() => {
    if (
      preselectedCampaignId &&
      campaigns.some(
        (
          campaign
        ) =>
          campaign.campaignId ===
          preselectedCampaignId
      )
    ) {
      setSendMode(
        'existing'
      );

      setSelectedCampaignId(
        preselectedCampaignId
      );
    }
  }, [
    campaigns,
    preselectedCampaignId,
  ]);

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

                  headerMedia:
                    data?.headerMedia &&
                    (
                      String(
                        data.headerMedia?.type ||
                          ''
                      ).toUpperCase() ===
                        'DOCUMENT' ||
                      String(
                        data.headerMedia?.type ||
                          ''
                      ).toUpperCase() ===
                        'IMAGE'
                    )
                      ? {
                          type:
                            String(
                              data.headerMedia.type
                            ).toUpperCase() as
                              | 'DOCUMENT'
                              | 'IMAGE',

                          storagePath:
                            data.headerMedia
                              ?.storagePath
                              ? String(
                                  data.headerMedia
                                    .storagePath
                                )
                              : undefined,

                          fileName:
                            String(
                              data.headerMedia
                                ?.fileName ||
                                (
                                  String(
                                    data.headerMedia
                                      ?.type ||
                                      ''
                                  ).toUpperCase() ===
                                  'DOCUMENT'
                                    ? 'document.pdf'
                                    : 'image'
                                )
                            ),

                          mimeType:
                            String(
                              data.headerMedia
                                ?.mimeType ||
                                (
                                  String(
                                    data.headerMedia
                                      ?.type ||
                                      ''
                                  ).toUpperCase() ===
                                  'DOCUMENT'
                                    ? 'application/pdf'
                                    : 'image/jpeg'
                                )
                            ),

                          size:
                            Number(
                              data.headerMedia
                                ?.size ||
                                0
                            ),
                        }
                      : null,
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
          setIsLoadingTemplates(false);

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

  const selectedCampaign =
    useMemo(
      () =>
        availableCampaigns.find(
          (
            campaign
          ) =>
            campaign.campaignId ===
            selectedCampaignId
        ) ||
        null,
      [
        availableCampaigns,
        selectedCampaignId,
      ]
    );

  const effectiveTemplateName =
    sendMode ===
      'existing'
      ? selectedCampaign
          ?.templateName ||
        ''
      : selectedTemplateName;

  const filteredTemplates =
    useMemo(
      () => {
        const normalizedSearch =
          templateSearch
            .trim()
            .toLowerCase();

        if (!normalizedSearch) {
          return templates;
        }

        return templates.filter(
          (
            template
          ) =>
            [
              template.name,
              template.category ||
                '',
              template.language ||
                '',
              template.bodyText ||
                '',
            ].some(
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
            )
        );
      },
      [
        templates,
        templateSearch,
      ]
    );

  const selectedTemplate =
    useMemo(
      () =>
        templates.find(
          (
            template
          ) =>
            template.name ===
            effectiveTemplateName
        ) ||
        null,
      [
        templates,
        effectiveTemplateName,
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

  const canSend =
    Boolean(
      agentId &&
      contactIds.length >
        0 &&
      (
        sendMode ===
          'existing'
          ? selectedCampaign &&
            effectiveTemplateName
          : campaignName.trim() &&
            selectedTemplateName
      )
    );

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
        contactIds.length >
        100
      ) {
        setErrorMessage(
          'ניתן לשלוח עד 100 אנשי קשר בכל פעימת שליחה.'
        );
        return;
      }

      if (
        sendMode ===
        'existing'
      ) {
        if (!selectedCampaign) {
          setErrorMessage(
            'יש לבחור קמפיין קיים.'
          );
          return;
        }

        if (
          !selectedCampaign
            .templateName
        ) {
          setErrorMessage(
            'לקמפיין שנבחר לא משויכת תבנית WhatsApp.'
          );
          return;
        }
      } else {
        if (
          !campaignName.trim()
        ) {
          setErrorMessage(
            'יש להזין שם לקמפיין.'
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
      }

      if (!isConfirming) {
        setIsConfirming(true);
        return;
      }

      setIsConfirming(false);
      setIsSending(true);
      setErrorMessage('');

      try {
        const fn =
          httpsCallable<
            {
              agentId: string;
              contactIds: string[];
              campaignId?: string;
              templateName?: string;
              campaignName?: string;
            },
            SendCampaignResponse
          >(
            functions,
            'sendMagicTouchWhatsAppCampaign'
          );

        const response =
          await fn(
            sendMode ===
              'existing'
              ? {
                  agentId,
                  contactIds,
                  campaignId:
                    selectedCampaign
                      ?.campaignId,
                }
              : {
                  agentId,
                  contactIds,
                  templateName:
                    selectedTemplateName,
                  campaignName:
                    campaignName.trim(),
                }
          );

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

  const skippedResults =
    result?.results?.filter(
      (
        item
      ) =>
        item.skipped ===
        true
    ) ||
    [];

  const displayCampaignName =
    sendMode ===
      'existing'
      ? selectedCampaign?.name ||
        ''
      : campaignName.trim();

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="magic-touch-campaign-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[3px]"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
            event.currentTarget &&
          !isSending &&
          !isConfirming
        ) {
          onClose();
        }
      }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-[26px] bg-white shadow-[0_28px_90px_rgba(15,23,42,0.24)] ring-1 ring-slate-200/70">
        <header className="flex shrink-0 items-start justify-between border-b border-slate-100 px-7 py-5">
          <div>
            <h2
              id="magic-touch-campaign-title"
              className="text-2xl font-bold tracking-tight text-slate-900"
            >
              שליחת קמפיין WhatsApp
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              נבחרו{' '}
              <strong className="font-semibold text-slate-700">
                {contactIds.length}
              </strong>{' '}
              אנשי קשר לפעימה הנוכחית
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
            className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="סגירת החלון"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-6">
            {errorMessage ? (
              <div className="mb-5 rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm font-medium text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {result ? (
              <section className="space-y-5">
                <div
                  className={[
                    'rounded-2xl p-5 ring-1',
                    result.failed ===
                    0
                      ? 'bg-emerald-50/70 ring-emerald-100'
                      : result.sent >
                          0
                        ? 'bg-amber-50/70 ring-amber-100'
                        : 'bg-red-50/70 ring-red-100',
                  ].join(
                    ' '
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        הפעימה הסתיימה
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        הקמפיין{' '}
                        <strong className="text-slate-700">
                          {result.campaignName}
                        </strong>{' '}
                        נשאר פעיל וניתן לשלוח אליו פעימות נוספות.
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-100">
                      קמפיין פעיל
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <div className="text-2xl font-bold text-slate-900">
                        {result.received}
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        נבחרו
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <div className="text-2xl font-bold text-emerald-700">
                        {result.sent}
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        נשלחו עכשיו
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <div className="text-2xl font-bold text-red-700">
                        {result.failed}
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        נכשלו
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <div className="text-2xl font-bold text-blue-700">
                        {result.totalSent ??
                          result.sent}
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        נשלחו בקמפיין
                      </div>
                    </div>
                  </div>

                  {skippedResults.length >
                  0 ? (
                    <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
                      {skippedResults.length}{' '}
                      אנשי קשר כבר היו משויכים לקמפיין ולכן לא נשלחו שוב.
                    </div>
                  ) : null}
                </div>

                {failedResults.length >
                0 ? (
                  <div className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
                    <h3 className="font-bold text-red-800">
                      נמענים שלא נשלחו
                    </h3>

                    <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
                      {failedResults.map(
                        (
                          item
                        ) => (
                          <div
                            key={
                              item.contactId
                            }
                            className="rounded-xl bg-white px-3 py-2 text-sm shadow-sm"
                          >
                            <div
                              dir="ltr"
                              className="font-mono text-xs text-slate-400"
                            >
                              {item.contactId}
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
              </section>
            ) : (
              <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
                <section className="border-b border-slate-100 pb-6 lg:border-b-0 lg:border-l lg:border-slate-100 lg:pl-6">
                  <div className="mb-5">
                    <div className="text-sm font-bold text-slate-800">
                      לאיזה קמפיין לשלוח?
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSendMode(
                            'existing'
                          );
                          setErrorMessage(
                            ''
                          );

                          if (
                            !selectedCampaignId &&
                            availableCampaigns[0]
                          ) {
                            setSelectedCampaignId(
                              availableCampaigns[0]
                                .campaignId
                            );
                          }
                        }}
                        disabled={
                          availableCampaigns.length ===
                          0
                        }
                        className={[
                          'rounded-xl border px-4 py-3 text-sm font-semibold transition',
                          sendMode ===
                          'existing'
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                          availableCampaigns.length ===
                          0
                            ? 'cursor-not-allowed opacity-40'
                            : '',
                        ].join(
                          ' '
                        )}
                      >
                        קמפיין קיים
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSendMode(
                            'new'
                          );
                          setErrorMessage(
                            ''
                          );
                        }}
                        className={[
                          'rounded-xl border px-4 py-3 text-sm font-semibold transition',
                          sendMode ===
                          'new'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                        ].join(
                          ' '
                        )}
                      >
                        קמפיין חדש
                      </button>
                    </div>
                  </div>

                  {sendMode ===
                  'existing' ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600">
                          בחירת קמפיין
                        </label>

                        <select
                          value={
                            selectedCampaignId
                          }
                          onChange={(
                            event
                          ) =>
                            setSelectedCampaignId(
                              event.target.value
                            )
                          }
                          disabled={
                            isSending
                          }
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                        >
                          <option value="">
                            בחרי קמפיין...
                          </option>

                          {availableCampaigns.map(
                            (
                              campaign
                            ) => (
                              <option
                                key={
                                  campaign.campaignId
                                }
                                value={
                                  campaign.campaignId
                                }
                              >
                                {campaign.name}{' '}
                                •{' '}
                                {campaignStatusLabel(
                                  campaign.status
                                )}{' '}
                                •{' '}
                                {shortCampaignId(
                                  campaign.campaignId
                                )}
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      {selectedCampaign ? (
                        <div className="rounded-2xl bg-blue-50/70 p-4 ring-1 ring-blue-100">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-bold text-blue-500">
                                הקמפיין שנבחר
                              </div>

                              <div className="mt-1 font-bold text-slate-900">
                                {selectedCampaign.name}
                              </div>
                            </div>

                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
                              {campaignStatusLabel(
                                selectedCampaign.status
                              )}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                            <div className="rounded-xl bg-white p-3">
                              <div className="text-slate-400">
                                תבנית משויכת
                              </div>

                              <div className="mt-1 font-semibold text-slate-700">
                                {selectedCampaign.templateName ||
                                  'לא הוגדרה'}
                              </div>
                            </div>

                            <div className="rounded-xl bg-white p-3">
                              <div className="text-slate-400">
                                נשלחו עד כה
                              </div>

                              <div className="mt-1 font-semibold text-slate-700">
                                {selectedCampaign.sentCount}
                              </div>
                            </div>
                          </div>

                          {selectedCampaign.status !==
                          'active' ? (
                            <p className="mt-3 text-xs leading-5 text-blue-700">
                              זהו קמפיין היסטורי. שליחה חדשה תחזיר אותו לסטטוס פעיל ותמשיך באותו campaignId.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div>
                      <div className="mb-5">
                        <div className="text-sm font-bold text-slate-800">
                          פרטי קמפיין חדש
                        </div>

                        <label
                          htmlFor="magic-touch-campaign-name"
                          className="mt-3 block text-xs font-semibold text-slate-600"
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
                              event.target.value
                            )
                          }
                          disabled={
                            isSending
                          }
                          placeholder="לדוגמה: שנה טובה 2026"
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                        />

                        <p className="mt-1.5 text-xs text-slate-400">
                          התבנית שתיבחר עכשיו תהיה משויכת לקמפיין ולא תשתנה בין פעימות.
                        </p>
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-slate-800">
                              תבנית WhatsApp לקמפיין
                            </div>

                            <div className="mt-1 text-xs text-slate-400">
                              מוצגות רק תבניות שאושרו ב-Meta
                            </div>
                          </div>

                          {!isLoadingTemplates &&
                          templates.length >
                            0 ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                              {templates.length}{' '}
                              תבניות
                            </span>
                          ) : null}
                        </div>

                        <div className="relative mb-3">
                          <input
                            type="search"
                            value={
                              templateSearch
                            }
                            onChange={(
                              event
                            ) =>
                              setTemplateSearch(
                                event.target.value
                              )
                            }
                            placeholder="חיפוש לפי שם תבנית..."
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50"
                          />

                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                            ⌕
                          </span>
                        </div>

                        {isLoadingTemplates ? (
                          <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-400">
                            טוען תבניות...
                          </div>
                        ) : filteredTemplates.length ===
                          0 ? (
                          <div className="rounded-2xl bg-amber-50 p-5 text-center text-sm text-amber-700 ring-1 ring-amber-100">
                            לא נמצאו תבניות מתאימות.
                          </div>
                        ) : (
                          <div className="max-h-[260px] space-y-2 overflow-y-auto pl-1">
                            {filteredTemplates.map(
                              (
                                template
                              ) => {
                                const isSelected =
                                  template.name ===
                                  selectedTemplateName;

                                return (
                                  <button
                                    key={
                                      template.id
                                    }
                                    type="button"
                                    disabled={
                                      isSending
                                    }
                                    onClick={() =>
                                      setSelectedTemplateName(
                                        template.name
                                      )
                                    }
                                    className={[
                                      'w-full rounded-2xl border p-4 text-right transition',
                                      isSelected
                                        ? 'border-emerald-300 bg-emerald-50/60 shadow-sm'
                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60',
                                    ].join(
                                      ' '
                                    )}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div
                                        className={[
                                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                                          isSelected
                                            ? 'border-emerald-600 bg-emerald-600 text-white'
                                            : 'border-slate-300 bg-white text-transparent',
                                        ].join(
                                          ' '
                                        )}
                                      >
                                        ✓
                                      </div>

                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="truncate text-sm font-bold text-slate-800">
                                            {template.name}
                                          </div>

                                          {template.category ? (
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                                              {template.category}
                                            </span>
                                          ) : null}
                                        </div>

                                        {template.bodyText ? (
                                          <div className="mt-1.5 line-clamp-1 text-xs text-slate-400">
                                            {replaceTemplatePreview(
                                              template.bodyText,
                                              previewFirstName
                                            )}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </button>
                                );
                              }
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                <section className="pt-6 lg:pt-0 lg:pr-6">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-800">
                        תצוגה מקדימה
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        כך ההודעה תיראה ללקוח
                      </div>
                    </div>

                    {selectedTemplate ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        {selectedTemplate.language ||
                          'he'}
                      </span>
                    ) : null}
                  </div>

                  <div className="rounded-[22px] border border-slate-100 bg-[#f7f3ed] p-5">
                    {selectedTemplate?.bodyText ? (
                      <>
                        <div className="mx-auto max-w-[390px] rounded-2xl bg-white p-5 text-sm leading-7 text-slate-700 shadow-sm ring-1 ring-slate-100">
                          {selectedTemplate.headerMedia ? (
                            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-xl shadow-sm ring-1 ring-slate-100">
                                  {selectedTemplate.headerMedia.type ===
                                  'DOCUMENT'
                                    ? '📄'
                                    : '🖼️'}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                    {selectedTemplate.headerMedia.type ===
                                    'DOCUMENT'
                                      ? 'PDF / DOCUMENT'
                                      : 'IMAGE'}
                                  </div>

                                  <div className="mt-0.5 truncate text-xs font-semibold text-slate-700">
                                    {selectedTemplate.headerMedia.fileName}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          <div className="whitespace-pre-wrap">
                            {templatePreview}
                          </div>

                          <div className="mt-4 text-left text-[10px] text-slate-400">
                            11:30
                          </div>
                        </div>

                        {selectedTemplate.quickReplyButtons &&
                        selectedTemplate.quickReplyButtons.length >
                          0 ? (
                          <div className="mx-auto mt-3 max-w-[390px] rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
                            <div className="mb-2 text-center text-[10px] font-semibold text-slate-400">
                              כפתורי תגובה
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              {selectedTemplate.quickReplyButtons.map(
                                (
                                  buttonText
                                ) => (
                                  <span
                                    key={
                                      buttonText
                                    }
                                    className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-center text-xs font-semibold text-emerald-700"
                                  >
                                    {buttonText}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        ) : null}

                        {(selectedTemplate.bodyVariableCount ||
                          0) >
                        0 ? (
                          <p className="mt-4 text-center text-xs leading-5 text-slate-400">
                            ההודעה תישלח עם השם הפרטי של כל נמען במקום {'{{1}}'}.
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex min-h-[290px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center text-sm text-slate-400">
                        {sendMode ===
                        'existing'
                          ? 'בחרי קמפיין עם תבנית משויכת כדי לראות תצוגה מקדימה'
                          : 'בחרי תבנית כדי לראות תצוגה מקדימה'}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>

        {!result ? (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-7 py-4">
            <button
              type="button"
              onClick={
                onClose
              }
              disabled={
                isSending
              }
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
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
                !canSend
              }
              className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending
                ? 'שולח...'
                : 'הבא: אישור ושליחה'}
            </button>
          </footer>
        ) : (
          <footer className="flex shrink-0 justify-end border-t border-slate-100 bg-white px-7 py-4">
            <button
              type="button"
              onClick={
                onClose
              }
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              סיום
            </button>
          </footer>
        )}

        {isConfirming &&
        !result ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-[440px] rounded-[24px] bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.24)] ring-1 ring-slate-200">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-lg font-bold text-emerald-700">
                ✓
              </div>

              <div className="mt-4 text-center">
                <h3 className="text-xl font-bold text-slate-900">
                  לאשר את השליחה?
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  הקמפיין{' '}
                  <strong className="font-semibold text-slate-700">
                    {displayCampaignName ||
                      'החדש'}
                  </strong>{' '}
                  ישלח את התבנית{' '}
                  <strong className="font-semibold text-slate-700">
                    {effectiveTemplateName}
                  </strong>{' '}
                  ל-
                  <strong className="font-semibold text-slate-700">
                    {contactIds.length}
                  </strong>{' '}
                  אנשי קשר.
                </p>
              </div>

              {selectedTemplate?.bodyText ? (
                <div className="mt-5 rounded-2xl bg-slate-50/80 p-3">
                  <div className="text-[11px] font-bold text-slate-400">
                    ההודעה שתישלח
                  </div>

                  <div className="mt-2 max-h-[210px] overflow-y-auto rounded-xl bg-white p-3 text-sm leading-6 text-slate-700 ring-1 ring-slate-100">
                    <div className="whitespace-pre-wrap">
                      {templatePreview}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setIsConfirming(
                      false
                    )
                  }
                  disabled={
                    isSending
                  }
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  חזרה
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleSend()
                  }
                  disabled={
                    isSending
                  }
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSending
                    ? 'שולח...'
                    : 'כן, לשלוח'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
