'use client';

import React from 'react';
import type { AutoCompanyUiStatus } from '@/hooks/useAutomationDashboardStatus';

type Props = {
  companyName: string;
  monthLabel: string;
  uiStatus: AutoCompanyUiStatus;
  autoDisabledReason?: string;
  lastRunAt?: Date | null;
  onStart?: () => void;
  busy?: boolean;
  globallyBlocked?: boolean;
  globallyBlockedReason?: string;
};

function formatDateTime(date?: Date | null) {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return '';
  }
}

function getUiMeta(
  uiStatus: AutoCompanyUiStatus,
  autoDisabledReason?: string
): {
  cardClass: string;
  badgeClass: string;
  badgeText: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  canStart: boolean;
} {
  switch (uiStatus) {
    case 'done':
      return {
        cardClass: 'border-green-200 bg-green-50/70',
        badgeClass: 'bg-green-100 text-green-700 border-green-200',
        badgeText: 'נטען החודש',
        title: 'הושלם בהצלחה',
        subtitle: 'הדוחות שפורסמו החודש כבר נמשכו',
        canStart: false,
      };

    case 'running':
      return {
        cardClass: 'border-indigo-200 bg-indigo-50/70',
        badgeClass: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        badgeText: 'בריצה',
        title: 'טעינה אוטומטית בתהליך',
        subtitle: 'מתבצעת כרגע משיכה אוטומטית',
        canStart: false,
      };

    case 'error':
      return {
        cardClass: 'border-red-200 bg-red-50/70',
        badgeClass: 'bg-red-100 text-red-700 border-red-200',
        badgeText: 'שגיאה',
        title: 'הריצה האחרונה לא הושלמה',
        subtitle: 'אפשר לנסות שוב',
        actionLabel: 'נסה שוב',
        canStart: true,
      };

    case 'disabled_by_flag':
      return {
        cardClass: 'border-gray-200 bg-gray-50',
        badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
        badgeText: 'לא זמין',
        title: 'האוטומציה אינה זמינה החודש',
        subtitle: autoDisabledReason || 'הדוחות עדיין לא זמינים להורדה החודש',
        canStart: false,
      };

    case 'ready':
    default:
      return {
        cardClass: 'border-blue-200 bg-blue-50/70',
        badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
        badgeText: 'מוכן להפעלה',
        title: 'טרם בוצעה משיכה החודש',
        subtitle: 'ניתן להפעיל טעינה אוטומטית',
        actionLabel: 'הפעל טעינה',
        canStart: true,
      };
  }
}

const AutoCompanyCard: React.FC<Props> = ({
  companyName,
  monthLabel,
  uiStatus,
  autoDisabledReason,
  lastRunAt,
  onStart,
  busy = false,
  globallyBlocked = false,
  globallyBlockedReason = '',
}) => {
  const meta = getUiMeta(uiStatus, autoDisabledReason);
  const lastRunLabel = formatDateTime(lastRunAt);

  const actionDisabled =
    busy ||
    globallyBlocked ||
    !meta.canStart ||
    uiStatus === 'done' ||
    uiStatus === 'running' ||
    uiStatus === 'disabled_by_flag';

  const actionLabel = busy
    ? 'מתחיל ריצה...'
    : globallyBlocked
      ? 'ממתין...'
      : meta.actionLabel;

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${meta.cardClass}`}
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-lg font-bold text-gray-900">{companyName}</div>
          <div className="text-xs text-gray-500 mt-1">
            דוחות שפורסמו ב־{monthLabel}
          </div>
        </div>

        <div
          className={`px-2.5 py-1 rounded-full text-xs font-bold border ${meta.badgeClass}`}
        >
          {meta.badgeText}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-sm font-bold text-gray-800">{meta.title}</div>
        <div className="text-xs text-gray-600 mt-1">{meta.subtitle}</div>

        {globallyBlocked && (
          <div className="text-[11px] text-indigo-700 mt-2 font-medium">
            {globallyBlockedReason}
          </div>
        )}

        {lastRunLabel && (
          <div className="text-[11px] text-gray-500 mt-2">
            עדכון אחרון: {lastRunLabel}
          </div>
        )}
      </div>

      <div className="flex justify-start">
        {meta.actionLabel ? (
          <button
            type="button"
            onClick={onStart}
            disabled={actionDisabled}
            className={`px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition
              ${
                actionDisabled
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : uiStatus === 'error'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
          >
            {actionLabel}
          </button>
        ) : (
          <div className="px-4 py-2 rounded-xl text-sm font-bold bg-white/70 text-gray-600 border border-white/80">
            {uiStatus === 'done'
              ? 'הושלם'
              : uiStatus === 'running'
                ? 'בריצה...'
                : 'לא זמין'}
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoCompanyCard;