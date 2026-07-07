'use client';

import React, { useState } from 'react';
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
  errorMessage?: string;
  onDelete?: () => void;
  missingReports?: Array<{ templateId: string; templateName?: string; status: string }>;
  // 🔧 חדש: תמיכה בהורדה מוקדמת (M-1)
  allowEarlyDownload?: boolean;         // האם לחברה יש את האופציה
  earlyDownloadOpen?: boolean;          // האם הקונפיג הגלובלי מאפשר כרגע
  selectedReportMonth?: string;         // YYYY-MM — מה בחר הסוכן (אם בחר)
  onSelectReportMonth?: (companyId: string, reportMonth: string) => void;
  companyId: string;
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

function getMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני',
                  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  return `${months[Number(m) - 1]} ${y}`;
}

function getOffsetYm(offsetMonths: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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
    case 'queued':
      return {
        cardClass: 'border-amber-200 bg-amber-50/70',
        badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
        badgeText: 'ממתין בתור',
        title: 'ממתין להפעלה בתור',
        subtitle: 'תרוץ בקרוב אוטומטית',
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

// ─── מודאל בחירת חודש דיווח ────────────────────────────────────────
type ReportMonthModalProps = {
  companyName: string;
  onConfirm: (reportMonth: string) => void;
  onCancel: () => void;
};

const ReportMonthModal: React.FC<ReportMonthModalProps> = ({ companyName, onConfirm, onCancel }) => {
  const ymMinus1 = getOffsetYm(1);
  const ymMinus2 = getOffsetYm(2);
  const [selected, setSelected] = useState<string>(ymMinus2);

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center"
      dir="rtl"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-[min(420px,95vw)] p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-1">הורדת דוחות</h3>
        <p className="text-sm text-gray-500 mb-4">{companyName}</p>

        <p className="text-sm font-semibold text-gray-700 mb-3">בחר חודש דיווח:</p>

        <div className="space-y-2 mb-5">
          {/* M-2 — ברירת מחדל */}
          <label
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              selected === ymMinus2
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input
              type="radio"
              name="reportMonth"
              value={ymMinus2}
              checked={selected === ymMinus2}
              onChange={() => setSelected(ymMinus2)}
              className="accent-blue-600"
            />
            <div>
              <div className="font-semibold text-gray-800">
                {getMonthLabel(ymMinus2)}
              </div>
              <div className="text-xs text-gray-500">מינוס חודשיים — ברירת מחדל</div>
            </div>
          </label>

          {/* M-1 — הורדה מוקדמת */}
          <label
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              selected === ymMinus1
                ? 'border-indigo-400 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input
              type="radio"
              name="reportMonth"
              value={ymMinus1}
              checked={selected === ymMinus1}
              onChange={() => setSelected(ymMinus1)}
              className="accent-indigo-600"
            />
            <div>
              <div className="font-semibold text-gray-800">
                {getMonthLabel(ymMinus1)}
              </div>
              <div className="text-xs text-indigo-600 font-medium">מינוס חודש — הורדה מוקדמת</div>
            </div>
          </label>
        </div>

        <div className="flex gap-2 justify-start">
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
          >
            הוסף לתור
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── הכרטיס הראשי ───────────────────────────────────────────────────
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
  missingReports = [],
  errorMessage,
  onDelete,
  allowEarlyDownload = false,
  earlyDownloadOpen = false,
  selectedReportMonth,
  onSelectReportMonth,
  companyId,
}) => {
  const meta = getUiMeta(uiStatus, autoDisabledReason);
  const lastRunLabel = formatDateTime(lastRunAt);
  const [showModal, setShowModal] = useState(false);

  const showEarlyDownloadOption = allowEarlyDownload && earlyDownloadOpen;

  // האם להציג אינדיקטור לבחירה הנוכחית
  const choiceLabel = selectedReportMonth ? getMonthLabel(selectedReportMonth) : null;
  const isEarlyChoice = selectedReportMonth && selectedReportMonth === getOffsetYm(1);

  return (
    <>
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

          <div className={`px-2.5 py-1 rounded-full text-xs font-bold border ${meta.badgeClass}`}>
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

          {/* 🔧 early download display */}
          {allowEarlyDownload && (
            <>
              {/* קונפיג סגור — ברירת מחדל M-2, לא צריך לבחור */}
              {!earlyDownloadOpen && (
                <div className="mt-2 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                  📅 הורדה בגין {getMonthLabel(getOffsetYm(2))}
                </div>
              )}

              {/* קונפיג פתוח + טרם נבחר חודש */}
              {earlyDownloadOpen && !choiceLabel && (uiStatus === 'ready' || uiStatus === 'error') && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
                    className="w-full px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
                  >
                    ⚡ בחר חודש דיווח
                  </button>
                  <p className="text-[10px] text-indigo-600 mt-1 text-center">
                    יש לבחור חודש דיווח לפני הפעלת הריצה
                  </p>
                </div>
              )}

              {/* קונפיג פתוח + נבחר חודש */}
              {earlyDownloadOpen && choiceLabel && (
                <div className={`mt-2 text-[11px] font-semibold px-2 py-1.5 rounded-lg flex items-center justify-between ${
                  isEarlyChoice
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  <span>{isEarlyChoice ? '⚡ ' : '📅 '}בגין {choiceLabel}</span>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600 mr-1"
                    onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
                  >
                    ✎
                  </button>
                </div>
              )}
            </>
          )}

          {uiStatus === 'done' && onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="mt-2 text-[11px] text-amber-700 underline hover:text-amber-900 block"
            >
              🗑️ מחק ריצה ושלח מחדש
            </button>
          )}

          {uiStatus === 'done' && missingReports.length > 0 && (
            <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              ⚠️ דוחות שלא נקלטו:{' '}
              {missingReports.map(r => (r as any).templateName || r.templateId).join(', ')}
            </div>
          )}

          {uiStatus === 'error' && errorMessage && (
            <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
              ❌ {errorMessage}
            </div>
          )}
        </div>
      </div>

      {/* מודאל בחירת חודש */}
      {showModal && (
        <ReportMonthModal
          companyName={companyName}
          onConfirm={(reportMonth) => {
            onSelectReportMonth?.(companyId, reportMonth);
            setShowModal(false);
          }}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  );
};

export default AutoCompanyCard;
