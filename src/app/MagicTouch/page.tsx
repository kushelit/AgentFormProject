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
  useMagicTouchAgent,
} from '@/components/MagicTouch/MagicTouchAgentContext';

type CampaignStats = {
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  processing: number;
};

type DashboardCampaign = {
  campaignId: string;
  agentId: string;
  name: string;
  channel: string;
  templateName: string;
  status: string;
  lastBatchStatus: string | null;
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  processedCount: number;
  startedAt: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  completedAt: number | null;
  stats: CampaignStats;
};


type HumanAttentionItem = {
  runId: string;
  flowId: string | null;
  flowName: string | null;
  currentStepId: string | null;
  contactId: string | null;
  conversationId: string | null;
  contactName: string;
  phone: string | null;
  reason: string;
  waitingSince: number | null;
};

type DashboardResponse = {
  ok: boolean;
  agentId: string;
  scope: 'campaign' | 'active_campaigns';
  selectedCampaignId: string | null;
  selectedCampaign: DashboardCampaign | null;
  activeCampaignCount: number;
  stats: CampaignStats;
  campaigns: DashboardCampaign[];
  humanAttention: {
    total: number;
    items: HumanAttentionItem[];
  };
};

function formatDate(
  value: number | null
): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'he-IL',
    {
      dateStyle: 'short',
      timeStyle: 'short',
    }
  ).format(
    new Date(value)
  );
}

function Metric({
  label,
  value,
  tone = 'default',
  href,
}: {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'violet' | 'danger';
  href?: string | null;
}) {
  const valueClass =
    tone === 'success'
      ? 'text-emerald-700'
      : tone === 'violet'
        ? 'text-violet-700'
        : tone === 'danger'
          ? 'text-rose-700'
          : 'text-slate-900';

  const content = (
    <>
      <div className="text-xs font-semibold text-slate-400">
        {label}
      </div>

      <div
        className={`mt-1 text-2xl font-bold tracking-tight ${valueClass}`}
      >
        {value.toLocaleString('he-IL')}
      </div>
    </>
  );

  if (!href) {
    return (
      <div className="min-w-0">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="-m-2 min-w-0 rounded-xl p-2 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
      title={`${label} — הצגת אנשי הקשר`}
    >
      {content}
    </Link>
  );
}

function contactsHref(
  campaignId: string,
  campaignStatus?: string
): string | null {
  const normalizedCampaignId =
    String(campaignId || '').trim();

  if (!normalizedCampaignId) {
    return null;
  }

  const params =
    new URLSearchParams();

  params.set(
    'campaignId',
    normalizedCampaignId
  );

  if (campaignStatus) {
    params.set(
      'campaignStatus',
      campaignStatus
    );
  }

  return `/MagicTouch/Contacts?${params.toString()}`;
}

export default function MagicTouchDashboardPage() {
  const {
    selectedAgentId,
  } =
    useMagicTouchAgent();

  const agentId =
    selectedAgentId;

  const [
    selectedCampaignId,
    setSelectedCampaignId,
  ] =
    useState('');

  const [
    data,
    setData,
  ] =
    useState<DashboardResponse | null>(
      null
    );

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

  const loadDashboard =
    useCallback(
      async () => {
        if (!agentId) {
          setData(null);
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
                campaignId?: string;
              },
              DashboardResponse
            >(
              functions,
              'getMagicTouchDashboard'
            );

          const result =
            await fn({
              agentId,
              campaignId:
                selectedCampaignId ||
                undefined,
            });

          setData(
            result.data
          );
        } catch (
          error: any
        ) {
          console.error(
            '[MagicTouchDashboardPage] Failed to load dashboard',
            error
          );

          setData(null);

          setErrorMessage(
            error?.message ||
              'לא ניתן היה לטעון את נתוני הדשבורד.'
          );
        } finally {
          setIsLoading(false);
        }
      },
      [
        agentId,
        selectedCampaignId,
      ]
    );

  useEffect(() => {
    setSelectedCampaignId('');
  }, [agentId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const stats =
    data?.stats || {
      recipients: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      replied: 0,
      failed: 0,
      processing: 0,
    };

  const selectedCampaignLabel =
    useMemo(
      () => {
        if (!selectedCampaignId) {
          return 'כל הקמפיינים הפעילים';
        }

        return (
          data?.selectedCampaign?.name ||
          data?.campaigns.find(
            (
              campaign
            ) =>
              campaign.campaignId ===
              selectedCampaignId
          )?.name ||
          selectedCampaignId
        );
      },
      [
        data,
        selectedCampaignId,
      ]
    );

  const campaignsToShow =
    useMemo(
      () =>
        (data?.campaigns || [])
          .slice()
          .sort(
            (
              first,
              second
            ) =>
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
          )
          .slice(0, 6),
      [data]
    );

  return (
    <div
      dir="rtl"
      className="mx-auto w-full max-w-[1500px]"
    >
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-bold text-blue-600">
            Magic Touch
          </div>

          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            דשבורד
          </h1>

          <p className="mt-1.5 text-sm text-slate-500">
            תמונת מצב קצרה של הקמפיינים והמשימות שמחכות לטיפול.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block min-w-[290px]">
            <span className="mb-1.5 block text-xs font-bold text-slate-500">
              קמפיין
            </span>

            <select
              value={selectedCampaignId}
              onChange={(event) =>
                setSelectedCampaignId(
                  event.target.value
                )
              }
              disabled={
                isLoading ||
                !agentId
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-50 disabled:opacity-50"
            >
              <option value="">
                כל הקמפיינים הפעילים
              </option>

              {(data?.campaigns || []).map(
                (
                  campaign
                ) => (
                  <option
                    key={campaign.campaignId}
                    value={campaign.campaignId}
                  >
                    {campaign.name}
                  </option>
                )
              )}
            </select>
          </label>

          <button
            type="button"
            onClick={() =>
              void loadDashboard()
            }
            disabled={
              isLoading ||
              !agentId
            }
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoading
              ? 'טוען...'
              : 'רענון'}
          </button>
        </div>
      </header>

      {errorMessage ? (
        <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-2xl bg-white px-5 py-5 shadow-[0_6px_22px_rgba(15,23,42,0.04)] ring-1 ring-slate-100">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-400">
              מציג עכשיו
            </div>

            <div className="mt-1 truncate text-lg font-bold text-slate-900">
              {selectedCampaignLabel}
            </div>

            {!selectedCampaignId ? (
              <div className="mt-1 text-xs text-slate-400">
                {data?.activeCampaignCount || 0} קמפיינים פעילים
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {data?.selectedCampaign?.templateName ? (
                  <div className="text-xs text-slate-400">
                    תבנית: {data.selectedCampaign.templateName}
                  </div>
                ) : null}

                <Link
                  href={contactsHref(
                    selectedCampaignId
                  ) || '#'}
                  className="text-xs font-bold text-blue-600 transition hover:text-blue-700 hover:underline"
                >
                  לכל אנשי הקשר בקמפיין ←
                </Link>

              </div>
            )}
          </div>

          <div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
              <Metric
                label="נמענים"
                value={stats.recipients}
                href={contactsHref(
                  selectedCampaignId
                )}
              />

              <Metric
                label="נשלחו"
                value={stats.sent}
                href={contactsHref(
                  selectedCampaignId,
                  'already_sent'
                )}
              />

              <Metric
                label="נמסרו"
                value={stats.delivered}
                tone="success"
                href={contactsHref(
                  selectedCampaignId,
                  'delivered'
                )}
              />

              <Metric
                label="נקראו"
                value={stats.read}
                tone="success"
                href={contactsHref(
                  selectedCampaignId,
                  'read'
                )}
              />

              <Metric
                label="הגיבו"
                value={stats.replied}
                tone="violet"
                href={contactsHref(
                  selectedCampaignId,
                  'replied'
                )}
              />

              <Metric
                label="נכשלו"
                value={stats.failed}
                tone="danger"
                href={contactsHref(
                  selectedCampaignId,
                  'failed'
                )}
              />
            </div>

            {selectedCampaignId ? (
              <div className="mt-3 text-[11px] font-semibold text-slate-400">
                לחצי על נתון כדי לפתוח את אנשי הקשר של הקמפיין באותו סטטוס.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {(data?.humanAttention?.total || 0) > 0 ? (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-bold text-amber-900">
                דורשים את הטיפול שלך
              </div>

              <div className="mt-1 text-sm text-amber-700">
                {data?.humanAttention?.total || 0} תהליכים ממתינים להתערבות אנושית.
              </div>

              <Link
                href="/MagicTouch/Attention"
                className="mt-2 inline-flex items-center rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-200"
              >
                לכל הממתינים לטיפול ←
              </Link>
            </div>

            <div className="grid flex-1 gap-2 lg:max-w-[820px] lg:grid-cols-2">
              {(data?.humanAttention?.items || [])
                .slice(0, 4)
                .map(
                  (
                    item
                  ) => (
                    <div
                      key={item.runId}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-amber-100"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-800">
                          {item.contactName}
                        </div>

                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {item.reason}
                        </div>
                      </div>

                      {item.conversationId ? (
                        <Link
                          href={`/MagicTouch/Conversations?conversationId=${encodeURIComponent(
                            item.conversationId
                          )}`}
                          className="shrink-0 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-200"
                        >
                          לטיפול
                        </Link>
                      ) : item.contactId ? (
                        <Link
                          href={`/MagicTouch/Contacts/${encodeURIComponent(
                            item.contactId
                          )}?agentId=${encodeURIComponent(
                            agentId
                          )}`}
                          className="shrink-0 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-200"
                          title="לא נמצא מזהה שיחת WhatsApp, מעבר לאיש הקשר"
                        >
                          לאיש קשר
                        </Link>
                      ) : null}
                    </div>
                  )
                )}
            </div>
          </div>
        </section>
      ) : (
        <div className="mt-4 text-xs font-semibold text-emerald-700">
          ✓ אין כרגע תהליכים שממתינים להתערבות אנושית
        </div>
      )}

      <section className="mt-6 rounded-2xl bg-white shadow-[0_6px_22px_rgba(15,23,42,0.04)] ring-1 ring-slate-100">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              קמפיינים פעילים
            </h2>

            <p className="mt-0.5 text-xs text-slate-400">
              הקמפיינים האחרונים שעדיין פתוחים לשליחה.
            </p>
          </div>

          <div className="flex items-center gap-4">
            {selectedCampaignId ? (
              <button
                type="button"
                onClick={() =>
                  setSelectedCampaignId('')
                }
                className="text-sm font-bold text-slate-500 transition hover:text-slate-700"
              >
                הצג את כולם
              </button>
            ) : null}

            <Link
              href="/MagicTouch/Campaigns"
              className="text-sm font-bold text-blue-600 hover:text-blue-700"
            >
              לכל הקמפיינים ←
            </Link>
          </div>
        </div>

        {campaignsToShow.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            אין כרגע קמפיינים פעילים.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {campaignsToShow.map(
              (
                campaign
              ) => {
                const isSelected =
                  campaign.campaignId ===
                  selectedCampaignId;

                return (
                  <div
                    key={campaign.campaignId}
                    className={[
                      'grid grid-cols-[minmax(0,1fr)_70px_70px_70px_70px] items-center gap-3 px-5 py-4 transition',
                      isSelected
                        ? 'bg-blue-50/60'
                        : 'hover:bg-slate-50/70',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedCampaignId(
                          campaign.campaignId
                        )
                      }
                      aria-pressed={isSelected}
                      className="min-w-0 rounded-xl p-1 text-right transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      title="הצגת הקמפיין בדשבורד"
                    >
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-bold text-slate-800">
                          {campaign.name}
                        </div>

                        {isSelected ? (
                          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                            מוצג עכשיו
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="truncate">
                          {campaign.templateName || 'ללא תבנית'}
                        </span>

                        <span>·</span>

                        <span className="whitespace-nowrap">
                          {formatDate(campaign.updatedAt)}
                        </span>
                      </div>
                    </button>

                    <Link
                      href={contactsHref(
                        campaign.campaignId,
                        'already_sent'
                      ) || '#'}
                      className="rounded-xl p-2 text-center transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      title="הצגת אנשי הקשר שנשלחו בקמפיין"
                    >
                      <div className="text-xs text-slate-400">
                        נשלחו
                      </div>

                      <div className="mt-1 font-bold text-slate-700">
                        {campaign.stats.sent}
                      </div>
                    </Link>

                    <Link
                      href={contactsHref(
                        campaign.campaignId,
                        'read'
                      ) || '#'}
                      className="rounded-xl p-2 text-center transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      title="הצגת אנשי הקשר שקראו את הקמפיין"
                    >
                      <div className="text-xs text-slate-400">
                        נקראו
                      </div>

                      <div className="mt-1 font-bold text-emerald-700">
                        {campaign.stats.read}
                      </div>
                    </Link>

                    <Link
                      href={contactsHref(
                        campaign.campaignId,
                        'replied'
                      ) || '#'}
                      className="rounded-xl p-2 text-center transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-100"
                      title="הצגת אנשי הקשר שהגיבו לקמפיין"
                    >
                      <div className="text-xs text-slate-400">
                        הגיבו
                      </div>

                      <div className="mt-1 font-bold text-violet-700">
                        {campaign.stats.replied}
                      </div>
                    </Link>

                    <Link
                      href={contactsHref(
                        campaign.campaignId,
                        'failed'
                      ) || '#'}
                      className="rounded-xl p-2 text-center transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      title="הצגת אנשי הקשר שהשליחה אליהם נכשלה"
                    >
                      <div className="text-xs text-slate-400">
                        נכשלו
                      </div>

                      <div className="mt-1 font-bold text-rose-700">
                        {campaign.stats.failed}
                      </div>
                    </Link>
                  </div>
                );
              }
            )}
          </div>
        )}
      </section>
    </div>
  );
}
