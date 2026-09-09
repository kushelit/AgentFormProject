'use client';

import {
  useCallback,
  useEffect,
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

export default function MagicTouchAttentionPage() {
  const {
    selectedAgentId,
  } = useMagicTouchAgent();

  const agentId =
    selectedAgentId;

  const [
    items,
    setItems,
  ] = useState<HumanAttentionItem[]>([]);

  const [
    total,
    setTotal,
  ] = useState(0);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const loadItems =
    useCallback(
      async () => {
        if (!agentId) {
          setItems([]);
          setTotal(0);
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
                humanAttentionLimit: number;
              },
              DashboardResponse
            >(
              functions,
              'getMagicTouchDashboard'
            );

          const result =
            await fn({
              agentId,
              humanAttentionLimit: 200,
            });

          setItems(
            Array.isArray(
              result.data?.humanAttention?.items
            )
              ? result.data.humanAttention.items
              : []
          );

          setTotal(
            Number(
              result.data?.humanAttention?.total ||
              0
            )
          );
        } catch (
          error: any
        ) {
          console.error(
            '[MagicTouchAttentionPage] Failed to load human attention items',
            error
          );

          setItems([]);
          setTotal(0);

          setErrorMessage(
            error?.message ||
              'לא ניתן היה לטעון את התהליכים שממתינים לטיפול.'
          );
        } finally {
          setIsLoading(false);
        }
      },
      [agentId]
    );

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  return (
    <section
      dir="rtl"
      className="mx-auto w-full max-w-[1400px]"
    >
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-bold text-blue-600">
            Magic Touch
          </div>

          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            ממתינים לטיפול
          </h1>

          <p className="mt-1.5 text-sm text-slate-500">
            תהליכים שנעצרו ומחכים להתערבות אנושית.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/MagicTouch"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            חזרה לדשבורד
          </Link>

          <button
            type="button"
            onClick={() =>
              void loadItems()
            }
            disabled={
              isLoading ||
              !agentId
            }
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
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

      <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-100">
        <span className="text-lg font-bold">
          {total.toLocaleString('he-IL')}
        </span>
        ממתינים לטיפול
      </div>

      {isLoading ? (
        <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-400 ring-1 ring-slate-100">
          טוען תהליכים...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-8 text-center text-sm font-semibold text-emerald-700">
          ✓ אין כרגע תהליכים שממתינים להתערבות אנושית.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_6px_22px_rgba(15,23,42,0.04)] ring-1 ring-slate-100">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-right">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">
                    איש קשר
                  </th>
                  <th className="px-5 py-3.5">
                    סיבת העצירה
                  </th>
                  <th className="px-5 py-3.5">
                    תהליך
                  </th>
                  <th className="px-5 py-3.5">
                    ממתין מאז
                  </th>
                  <th className="px-5 py-3.5">
                    פעולה
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {items.map(
                  (
                    item
                  ) => (
                    <tr
                      key={item.runId}
                      className="transition hover:bg-slate-50/70"
                    >
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900">
                          {item.contactName}
                        </div>

                        {item.phone ? (
                          <div
                            dir="ltr"
                            className="mt-0.5 text-right text-xs text-slate-400"
                          >
                            {item.phone}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-700">
                        {item.reason}
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-500">
                        {item.flowName || '—'}
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-500">
                        {formatDate(
                          item.waitingSince
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {item.conversationId ? (
                          <Link
                            href={`/MagicTouch/Conversations?conversationId=${encodeURIComponent(
                              item.conversationId
                            )}`}
                            className="inline-flex rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-200"
                          >
                            לטיפול בשיחה
                          </Link>
                        ) : item.contactId ? (
                          <Link
                            href={`/MagicTouch/Contacts/${encodeURIComponent(
                              item.contactId
                            )}?agentId=${encodeURIComponent(
                              agentId
                            )}`}
                            className="inline-flex rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
                            title="לא נמצאה שיחת WhatsApp מקושרת"
                          >
                            לאיש קשר
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">
                            ללא שיחה מקושרת
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
