'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  httpsCallable,
} from 'firebase/functions';

import {
  functions,
} from '@/lib/firebase/firebase';

import {
  useMagicTouchAgent,
} from '@/components/MagicTouch/MagicTouchAgentContext';

type MagicTouchCampaignSummary = {
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
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
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

type GetCampaignsResponse = {
  ok: boolean;
  agentId: string;
  campaigns: MagicTouchCampaignSummary[];
  count: number;
};

type RecalculateCampaignStatsResponse = {
  ok: boolean;
  agentId: string;
  campaignId: string;
  totalContacts: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  processedCount: number;
};

type MergeCampaignsResponse = {
  ok: boolean;
  agentId: string;
  targetCampaignId: string;
  createdTargetCampaign: boolean;
  templateName: string;
  sourceCampaignIds: string[];
  mergedCampaignCount: number;
  totalContacts: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  processedCount: number;
};

type TargetMode =
  | 'new'
  | 'existing';

function formatDate(
  value?: number | null
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

function statusLabel(
  status: string
): string {
  switch (
    status
  ) {
    case 'active':
      return 'פעיל';

    case 'processing':
      return 'בתהליך';

    case 'completed':
      return 'הושלם';

    case 'completed_with_errors':
      return 'הושלם עם שגיאות';

    case 'failed':
      return 'נכשל';

    case 'archived':
      return 'בארכיון';

    case 'merged':
      return 'אוחד';

    default:
      return status ||
        '—';
  }
}

function statusClassName(
  status: string
): string {
  switch (
    status
  ) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700';

    case 'completed':
      return 'bg-blue-50 text-blue-700';

    case 'completed_with_errors':
      return 'bg-amber-50 text-amber-700';

    case 'failed':
      return 'bg-rose-50 text-rose-700';

    case 'merged':
      return 'bg-violet-50 text-violet-700';

    case 'archived':
      return 'bg-slate-100 text-slate-500';

    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export default function MagicTouchCampaignsPage() {
  const {
    selectedAgentId,
  } =
    useMagicTouchAgent();

  const agentId =
    selectedAgentId;

  const [
    campaigns,
    setCampaigns,
  ] =
    useState<MagicTouchCampaignSummary[]>([]);

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    isMerging,
    setIsMerging,
  ] =
    useState(false);

  const [
    recalculatingCampaignId,
    setRecalculatingCampaignId,
  ] =
    useState('');

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
    search,
    setSearch,
  ] =
    useState('');

  const [
    templateFilter,
    setTemplateFilter,
  ] =
    useState('');

  const [
    showMerged,
    setShowMerged,
  ] =
    useState(false);

  const [
    selectedCampaignIds,
    setSelectedCampaignIds,
  ] =
    useState<Set<string>>(
      new Set()
    );

  const [
    targetMode,
    setTargetMode,
  ] =
    useState<TargetMode>(
      'new'
    );

  const [
    targetCampaignName,
    setTargetCampaignName,
  ] =
    useState('');

  const [
    targetCampaignId,
    setTargetCampaignId,
  ] =
    useState('');

  const loadCampaigns =
    useCallback(
      async () => {
        if (!agentId) {
          setCampaigns([]);
          setIsLoading(false);
          return;
        }

        setIsLoading(true);
        setErrorMessage('');

        try {
          const fn =
            httpsCallable<
              {
                agentId: string;
                includeMerged: boolean;
              },
              GetCampaignsResponse
            >(
              functions,
              'getMagicTouchCampaigns'
            );

          const result =
            await fn({
              agentId,
              includeMerged:
                true,
            });

          setCampaigns(
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
            '[MagicTouchCampaignsPage] Failed to load campaigns',
            error
          );

          setCampaigns([]);

          setErrorMessage(
            error?.message ||
              'לא ניתן היה לטעון את הקמפיינים.'
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
    void loadCampaigns();
  }, [
    loadCampaigns,
  ]);

  useEffect(() => {
    setSelectedCampaignIds(
      new Set()
    );

    setTargetMode(
      'new'
    );

    setTargetCampaignName(
      ''
    );

    setTargetCampaignId(
      ''
    );

    setSearch(
      ''
    );

    setTemplateFilter(
      ''
    );

    setSuccessMessage(
      ''
    );

    setErrorMessage(
      ''
    );
  }, [
    agentId,
  ]);

  const templateOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            campaigns
              .map(
                (
                  campaign
                ) =>
                  campaign.templateName
              )
              .filter(Boolean)
          )
        ).sort(
          (
            first,
            second
          ) =>
            first.localeCompare(
              second
            )
        ),
      [
        campaigns,
      ]
    );

  const selectedCampaigns =
    useMemo(
      () =>
        campaigns.filter(
          (
            campaign
          ) =>
            selectedCampaignIds.has(
              campaign.campaignId
            )
        ),
      [
        campaigns,
        selectedCampaignIds,
      ]
    );

  const selectedTemplateName =
    useMemo(
      () => {
        const names =
          Array.from(
            new Set(
              selectedCampaigns
                .map(
                  (
                    campaign
                  ) =>
                    campaign.templateName
                )
                .filter(Boolean)
            )
          );

        return names.length ===
          1
          ? names[0]
          : '';
      },
      [
        selectedCampaigns,
      ]
    );

  const hasMixedTemplates =
    useMemo(
      () =>
        new Set(
          selectedCampaigns
            .map(
              (
                campaign
              ) =>
                campaign.templateName
            )
            .filter(Boolean)
        ).size >
        1,
      [
        selectedCampaigns,
      ]
    );

  const filteredCampaigns =
    useMemo(
      () => {
        const normalizedSearch =
          search
            .trim()
            .toLowerCase();

        return campaigns.filter(
          (
            campaign
          ) => {
            if (
              !showMerged &&
              campaign.status ===
                'merged'
            ) {
              return false;
            }

            if (
              templateFilter &&
              campaign.templateName !==
                templateFilter
            ) {
              return false;
            }

            if (
              !normalizedSearch
            ) {
              return true;
            }

            return [
              campaign.name,
              campaign.templateName,
              campaign.campaignId,
              campaign.createdByName ||
                '',
            ].some(
              (
                value
              ) =>
                String(
                  value ||
                    ''
                )
                  .toLowerCase()
                  .includes(
                    normalizedSearch
                  )
            );
          }
        );
      },
      [
        campaigns,
        search,
        templateFilter,
        showMerged,
      ]
    );

  const selectableVisibleCampaigns =
    useMemo(
      () =>
        filteredCampaigns.filter(
          (
            campaign
          ) =>
            campaign.status !==
              'merged' &&
            campaign.status !==
              'archived' &&
            (
              !selectedTemplateName ||
              campaign.templateName ===
                selectedTemplateName
            )
        ),
      [
        filteredCampaigns,
        selectedTemplateName,
      ]
    );

  const allVisibleSelected =
    selectableVisibleCampaigns.length >
      0 &&
    selectableVisibleCampaigns.every(
      (
        campaign
      ) =>
        selectedCampaignIds.has(
          campaign.campaignId
        )
    );

  const existingTargetOptions =
    useMemo(
      () =>
        campaigns.filter(
          (
            campaign
          ) =>
            campaign.status !==
              'merged' &&
            campaign.status !==
              'archived' &&
            !selectedCampaignIds.has(
              campaign.campaignId
            ) &&
            (
              !selectedTemplateName ||
              campaign.templateName ===
                selectedTemplateName
            )
        ),
      [
        campaigns,
        selectedCampaignIds,
        selectedTemplateName,
      ]
    );

  const toggleCampaign =
    (
      campaign: MagicTouchCampaignSummary
    ) => {
      if (
        campaign.status ===
          'merged' ||
        campaign.status ===
          'archived'
      ) {
        return;
      }

      if (
        selectedTemplateName &&
        campaign.templateName !==
          selectedTemplateName &&
        !selectedCampaignIds.has(
          campaign.campaignId
        )
      ) {
        setErrorMessage(
          `אפשר לאחד רק קמפיינים של אותה תבנית. כרגע נבחרה התבנית ${selectedTemplateName}.`
        );
        return;
      }

      setErrorMessage(
        ''
      );

      setSelectedCampaignIds(
        (
          current
        ) => {
          const next =
            new Set(
              current
            );

          if (
            next.has(
              campaign.campaignId
            )
          ) {
            next.delete(
              campaign.campaignId
            );
          } else {
            next.add(
              campaign.campaignId
            );
          }

          return next;
        }
      );
    };

  const toggleAllVisible =
    () => {
      setSelectedCampaignIds(
        (
          current
        ) => {
          const next =
            new Set(
              current
            );

          if (
            allVisibleSelected
          ) {
            for (
              const campaign of
              selectableVisibleCampaigns
            ) {
              next.delete(
                campaign.campaignId
              );
            }
          } else {
            for (
              const campaign of
              selectableVisibleCampaigns
            ) {
              next.add(
                campaign.campaignId
              );
            }
          }

          return next;
        }
      );
    };

  const clearSelection =
    () => {
      setSelectedCampaignIds(
        new Set()
      );

      setTargetCampaignId(
        ''
      );

      setTargetCampaignName(
        ''
      );
    };

  const handleRecalculateCampaign =
    async (
      campaign:
        MagicTouchCampaignSummary
    ) => {
      if (
        !agentId ||
        recalculatingCampaignId
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `לחשב מחדש את נתוני הקמפיין "${campaign.name}"?\n\nהפעולה לא שולחת הודעות. היא רק משחזרת את מוני המסירה, הקריאה והתגובות מהנתונים שכבר נשמרו.`
        );

      if (!confirmed) {
        return;
      }

      setRecalculatingCampaignId(
        campaign.campaignId
      );
      setErrorMessage('');
      setSuccessMessage('');

      try {
        const fn =
          httpsCallable<
            {
              agentId: string;
              campaignId: string;
            },
            RecalculateCampaignStatsResponse
          >(
            functions,
            'recalculateMagicTouchCampaignStats'
          );

        const response =
          await fn({
            agentId,
            campaignId:
              campaign.campaignId,
          });

        const result =
          response.data;

        setSuccessMessage(
          `הנתונים חושבו מחדש. נמענים: ${result.totalContacts}, נשלחו: ${result.sentCount}, נמסרו: ${result.deliveredCount}, נקראו: ${result.readCount}, הגיבו: ${result.repliedCount}, נכשלו: ${result.failedCount}.`
        );

        await loadCampaigns();
      } catch (error: any) {
        console.error(
          '[MagicTouchCampaignsPage] Recalculate failed',
          error
        );

        setErrorMessage(
          error?.message ||
            'חישוב נתוני הקמפיין מחדש נכשל.'
        );
      } finally {
        setRecalculatingCampaignId('');
      }
    };

  const handleMerge =
    async () => {
      if (
        !agentId ||
        isMerging
      ) {
        return;
      }

      if (
        selectedCampaignIds.size ===
        0
      ) {
        setErrorMessage(
          'יש לבחור לפחות קמפיין אחד לאיחוד.'
        );
        return;
      }

      if (
        hasMixedTemplates ||
        !selectedTemplateName
      ) {
        setErrorMessage(
          'אפשר לאחד רק קמפיינים שמשויכים לאותה תבנית WhatsApp.'
        );
        return;
      }

      if (
        targetMode ===
          'new' &&
        !targetCampaignName.trim()
      ) {
        setErrorMessage(
          'יש לתת שם לקמפיין המאוחד.'
        );
        return;
      }

      if (
        targetMode ===
          'existing' &&
        !targetCampaignId
      ) {
        setErrorMessage(
          'יש לבחור קמפיין יעד.'
        );
        return;
      }

      const confirmed =
        window.confirm(
          `לאחד ${selectedCampaignIds.size} קמפיינים של התבנית ${selectedTemplateName}?\n\nהקמפיינים הישנים לא יימחקו. הם יסומנו כ-merged ויישמרו לצורכי היסטוריה.`
        );

      if (!confirmed) {
        return;
      }

      setIsMerging(
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
              agentId: string;
              sourceCampaignIds: string[];
              targetCampaignId?: string;
              targetCampaignName?: string;
            },
            MergeCampaignsResponse
          >(
            functions,
            'mergeMagicTouchCampaigns'
          );

        const response =
          await fn({
            agentId,
            sourceCampaignIds:
              Array.from(
                selectedCampaignIds
              ),
            targetCampaignId:
              targetMode ===
                'existing'
                ? targetCampaignId
                : undefined,
            targetCampaignName:
              targetMode ===
                'new'
                ? targetCampaignName.trim()
                : undefined,
          });

        const result =
          response.data;

        setSuccessMessage(
          `האיחוד הסתיים בהצלחה. ${result.mergedCampaignCount} קמפיינים אוחדו לקמפיין אחד עם ${result.totalContacts} אנשי קשר. נשלחו: ${result.sentCount}, נמסרו: ${result.deliveredCount}, נקראו: ${result.readCount}, הגיבו: ${result.repliedCount}, נכשלו: ${result.failedCount}.`
        );

        clearSelection();

        await loadCampaigns();
      } catch (
        error: any
      ) {
        console.error(
          '[MagicTouchCampaignsPage] Merge failed',
          error
        );

        setErrorMessage(
          error?.message ||
            'איחוד הקמפיינים נכשל.'
        );
      } finally {
        setIsMerging(
          false
        );
      }
    };

  return (
    <section
      dir="rtl"
      className="w-full"
    >
      <div className="mx-auto max-w-[1580px]">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-bold text-blue-600">
              MagicTouch
            </div>

            <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">
              קמפיינים
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              ניהול קמפייני WhatsApp ואיחוד הקמפיינים הישנים שנוצרו בעבר כפעימות נפרדות.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadCampaigns()
            }
            disabled={
              isLoading ||
              !agentId
            }
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading
              ? 'טוען...'
              : 'רענון'}
          </button>
        </header>

        {errorMessage ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium leading-6 text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        <section className="mb-5 rounded-2xl border border-violet-100 bg-violet-50/60 p-5">
          <div className="font-bold text-violet-900">
            כלי תיקון היסטוריית קמפיינים
          </div>

          <p className="mt-1 text-sm leading-6 text-violet-700">
            הכלי לא מוחק קמפיינים ישנים. הוא מעביר את הנמענים והסטטוסים לקמפיין יעד אחד, מעדכן את אנשי הקשר והודעות WhatsApp, ומסמן את הקמפיינים הישנים כ־merged.
          </p>
        </section>

        <section className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_260px_auto] lg:items-center">
            <input
              type="search"
              value={
                search
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="חיפוש לפי שם קמפיין, תבנית או מזהה"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            />

            <select
              value={
                templateFilter
              }
              onChange={(
                event
              ) => {
                setTemplateFilter(
                  event.target.value
                );

                setSelectedCampaignIds(
                  new Set()
                );
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
            >
              <option value="">
                כל התבניות
              </option>

              {templateOptions.map(
                (
                  templateName
                ) => (
                  <option
                    key={
                      templateName
                    }
                    value={
                      templateName
                    }
                  >
                    {templateName}
                  </option>
                )
              )}
            </select>

            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={
                  showMerged
                }
                onChange={(
                  event
                ) =>
                  setShowMerged(
                    event.target.checked
                  )
                }
              />

              הצג גם קמפיינים שכבר אוחדו
            </label>
          </div>
        </section>

        {selectedCampaignIds.size >
        0 ? (
          <section className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="text-lg font-bold text-slate-900">
                  נבחרו {selectedCampaignIds.size} קמפיינים לאיחוד
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  תבנית: <strong className="text-slate-700">{selectedTemplateName || '—'}</strong>
                </div>

                <button
                  type="button"
                  onClick={
                    clearSelection
                  }
                  className="mt-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  ניקוי בחירה
                </button>
              </div>

              <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-sm ring-1 ring-blue-100">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetMode(
                        'new'
                      );

                      setTargetCampaignId(
                        ''
                      );
                    }}
                    className={`rounded-xl border px-4 py-3 text-right text-sm font-semibold transition ${
                      targetMode ===
                      'new'
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    צור קמפיין מאוחד חדש
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTargetMode(
                        'existing'
                      );

                      setTargetCampaignName(
                        ''
                      );
                    }}
                    className={`rounded-xl border px-4 py-3 text-right text-sm font-semibold transition ${
                      targetMode ===
                      'existing'
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    אחד לתוך קמפיין קיים
                  </button>
                </div>

                {targetMode ===
                'new' ? (
                  <div className="mt-4">
                    <label className="block text-xs font-bold text-slate-600">
                      שם הקמפיין המאוחד
                    </label>

                    <input
                      type="text"
                      value={
                        targetCampaignName
                      }
                      onChange={(
                        event
                      ) =>
                        setTargetCampaignName(
                          event.target.value
                        )
                      }
                      placeholder="למשל: שנה טובה 2026"
                      className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                    />
                  </div>
                ) : (
                  <div className="mt-4">
                    <label className="block text-xs font-bold text-slate-600">
                      קמפיין יעד
                    </label>

                    <select
                      value={
                        targetCampaignId
                      }
                      onChange={(
                        event
                      ) =>
                        setTargetCampaignId(
                          event.target.value
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
                    >
                      <option value="">
                        בחרי קמפיין יעד
                      </option>

                      {existingTargetOptions.map(
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
                            {campaign.name} — {campaign.totalContacts} אנשי קשר
                          </option>
                        )
                      )}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() =>
                    void handleMerge()
                  }
                  disabled={
                    isMerging ||
                    hasMixedTemplates ||
                    !selectedTemplateName ||
                    (
                      targetMode ===
                        'new'
                        ? !targetCampaignName.trim()
                        : !targetCampaignId
                    )
                  }
                  className="mt-4 w-full rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isMerging
                    ? 'מאחד קמפיינים...'
                    : `איחוד ${selectedCampaignIds.size} קמפיינים`}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-slate-400">
              טוען קמפיינים...
            </div>
          ) : filteredCampaigns.length ===
            0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              לא נמצאו קמפיינים להצגה.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1460px] w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                  <tr>
                    <th className="w-12 px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={
                          allVisibleSelected
                        }
                        onChange={
                          toggleAllVisible
                        }
                        aria-label="בחירת כל הקמפיינים המוצגים"
                      />
                    </th>

                    <th className="px-4 py-3.5">
                      קמפיין
                    </th>

                    <th className="px-4 py-3.5">
                      תבנית
                    </th>

                    <th className="px-4 py-3.5 text-center">
                      אנשי קשר
                    </th>

                    <th className="px-4 py-3.5 text-center">
                      נשלחו
                    </th>

                    <th className="px-4 py-3.5 text-center">
                      נמסרו
                    </th>

                    <th className="px-4 py-3.5 text-center">
                      נקראו
                    </th>

                    <th className="px-4 py-3.5 text-center">
                      הגיבו
                    </th>

                    <th className="px-4 py-3.5 text-center">
                      נכשלו
                    </th>

                    <th className="px-4 py-3.5">
                      סטטוס
                    </th>

                    <th className="px-4 py-3.5">
                      נוצר
                    </th>

                    <th className="px-4 py-3.5">
                      מזהה
                    </th>

                    <th className="px-4 py-3.5 text-center">
                      תיקון נתונים
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredCampaigns.map(
                    (
                      campaign
                    ) => {
                      const selected =
                        selectedCampaignIds.has(
                          campaign.campaignId
                        );

                      const disabled =
                        campaign.status ===
                          'merged' ||
                        campaign.status ===
                          'archived' ||
                        (
                          Boolean(
                            selectedTemplateName
                          ) &&
                          campaign.templateName !==
                            selectedTemplateName &&
                          !selected
                        );

                      return (
                        <tr
                          key={
                            campaign.campaignId
                          }
                          className={
                            selected
                              ? 'bg-blue-50/40'
                              : 'bg-white hover:bg-slate-50/60'
                          }
                        >
                          <td className="px-4 py-3.5 text-center">
                            <input
                              type="checkbox"
                              checked={
                                selected
                              }
                              disabled={
                                disabled
                              }
                              onChange={() =>
                                toggleCampaign(
                                  campaign
                                )
                              }
                              aria-label={`בחירת ${campaign.name}`}
                            />
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-slate-900">
                              {campaign.name}
                            </div>

                            {campaign.createdByName ? (
                              <div className="mt-0.5 text-xs text-slate-400">
                                נוצר על ידי {campaign.createdByName}
                              </div>
                            ) : null}
                          </td>

                          <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                            {campaign.templateName ||
                              '—'}
                          </td>

                          <td className="px-4 py-3.5 text-center font-semibold text-slate-700">
                            {campaign.totalContacts}
                          </td>

                          <td className="px-4 py-3.5 text-center font-semibold text-emerald-700">
                            {campaign.sentCount}
                          </td>

                          <td className="px-4 py-3.5 text-center font-semibold text-emerald-700">
                            {campaign.deliveredCount || 0}
                          </td>

                          <td className="px-4 py-3.5 text-center font-semibold text-emerald-700">
                            {campaign.readCount || 0}
                          </td>

                          <td className="px-4 py-3.5 text-center font-semibold text-violet-700">
                            {campaign.repliedCount || 0}
                          </td>

                          <td className="px-4 py-3.5 text-center font-semibold text-rose-700">
                            {campaign.failedCount}
                          </td>

                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClassName(
                                campaign.status
                              )}`}
                            >
                              {statusLabel(
                                campaign.status
                              )}
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-xs text-slate-500">
                            {formatDate(
                              campaign.createdAt
                            )}
                          </td>

                          <td
                            dir="ltr"
                            className="px-4 py-3.5 font-mono text-[11px] text-slate-400"
                          >
                            {campaign.campaignId}
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                void handleRecalculateCampaign(
                                  campaign
                                )
                              }
                              disabled={
                                Boolean(
                                  recalculatingCampaignId
                                ) ||
                                campaign.status ===
                                  'merged'
                              }
                              title="חשב מחדש את נתוני הקמפיין"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <span
                                className={
                                  recalculatingCampaignId ===
                                  campaign.campaignId
                                    ? 'inline-block animate-spin'
                                    : ''
                                }
                              >
                                ↻
                              </span>
                              {recalculatingCampaignId ===
                              campaign.campaignId
                                ? 'מחשב...'
                                : 'חשב מחדש'}
                            </button>
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
    </section>
  );
}
