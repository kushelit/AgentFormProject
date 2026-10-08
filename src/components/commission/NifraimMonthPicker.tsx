'use client';
// ═══════════════════════════════════════════════════════════════════
// src/components/commission/NifraimMonthPicker.tsx
// בחירת חודש יחיד לדוח נפרעים מטעינות: חודש פרסום (ברירת מחדל) או חודש דיווח.
// חודש פרסום — רק חודשים עם טעינות (/api/commission-comparison/by-ym, listYms), האחרון נבחר מראש.
// חודש דיווח — החודש הנוכחי נבחר מראש.
// משמש את דף הדוחות ואת החלון בדף סיכום העמלות.
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { postJsonCached } from '@/lib/fetchCache';

export type NifraimDateBasis = 'ym' | 'reportMonth';

export const NIFRAIM_BASIS_LABEL: Record<NifraimDateBasis, string> = {
  ym: 'חודש פרסום',
  reportMonth: 'חודש דיווח',
};

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** מצב הבחירה — basis + חודש הפרסום / הדיווח, והחודש האפקטיבי */
export function useNifraimMonth(agentId: string) {
  const [basis, setBasis] = useState<NifraimDateBasis>('ym');
  const [availableYms, setAvailableYms] = useState<string[]>([]);
  const [ymsLoading, setYmsLoading] = useState(false);
  const [selectedYm, setSelectedYm] = useState('');
  const [selectedReportMonth, setSelectedReportMonth] = useState(currentMonth);

  useEffect(() => {
    let cancelled = false;
    setAvailableYms([]);
    setSelectedYm('');
    if (!agentId || agentId === 'all') return;
    (async () => {
      setYmsLoading(true);
      try {
        const d = await postJsonCached('/api/commission-comparison/by-ym', { agentId, action: 'listYms' });
        if (cancelled) return;
        const yms: string[] = d.yms ?? [];
        setAvailableYms(yms);
        setSelectedYm(yms[0] ?? '');
      } catch {
        // ignore
      } finally {
        if (!cancelled) setYmsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return {
    basis,
    setBasis,
    availableYms,
    ymsLoading,
    selectedYm,
    setSelectedYm,
    selectedReportMonth,
    setSelectedReportMonth,
    month: basis === 'ym' ? selectedYm : selectedReportMonth,
  };
}

export type NifraimMonthState = ReturnType<typeof useNifraimMonth>;

const NifraimMonthPicker: React.FC<{ state: NifraimMonthState }> = ({ state }) => {
  const { basis, setBasis, availableYms, ymsLoading, selectedYm, setSelectedYm, selectedReportMonth, setSelectedReportMonth } =
    state;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex bg-white border rounded-lg p-0.5 text-sm">
        {(['ym', 'reportMonth'] as NifraimDateBasis[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBasis(b)}
            className={`px-3 py-1 rounded-md font-bold transition ${
              basis === b ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {NIFRAIM_BASIS_LABEL[b]}
          </button>
        ))}
      </div>

      {basis === 'ym' ? (
        <select
          value={selectedYm}
          onChange={(e) => setSelectedYm(e.target.value)}
          disabled={ymsLoading || !availableYms.length}
          className="select-input min-w-[140px]"
        >
          {ymsLoading && <option value="">טוען…</option>}
          {!ymsLoading && !availableYms.length && <option value="">אין טעינות לפי חודש פרסום</option>}
          {availableYms.map((ym) => (
            <option key={ym} value={ym}>
              {ym}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="month"
          value={selectedReportMonth}
          onChange={(e) => setSelectedReportMonth(e.target.value)}
          className="text-sm border rounded-lg px-3 py-1.5 bg-white"
        />
      )}

      <span className="text-xs text-gray-500">
        {basis === 'ym' ? 'כל מה שפורסם בחודש — כמו בטבלת "לפי חודש פרסום"' : 'לפי חודש הדיווח שבתוך הקובץ'}
      </span>
    </div>
  );
};

export default NifraimMonthPicker;
