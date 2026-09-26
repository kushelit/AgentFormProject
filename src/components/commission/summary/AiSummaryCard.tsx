'use client';
// src/components/commission/summary/AiSummaryCard.tsx
import React from 'react';
import type { AiSummary, AiTone } from '@/types/agentInsights';

interface Props {
  ai: AiSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const TONE_STYLE: Record<AiTone, { icon: string; cls: string }> = {
  positive: { icon: '▲', cls: 'text-emerald-600' },
  negative: { icon: '▼', cls: 'text-red-600' },
  warning: { icon: '⚠', cls: 'text-amber-600' },
  neutral: { icon: '•', cls: 'text-slate-400' },
};

const AiSummaryCard: React.FC<Props> = ({ ai, loading, error, onRefresh }) => (
  <div className="bg-gradient-to-l from-violet-50 to-white border border-violet-100 rounded-2xl p-5 shadow-sm">
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-black text-slate-800 flex items-center gap-2">
        <span>✨</span> סקירת AI
      </h3>
      <div className="flex items-center gap-3">
        {ai && !loading && (
          <span className="text-[11px] text-slate-400">
            נוצר {new Date(ai.generatedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-xs text-violet-700 hover:text-violet-900 disabled:opacity-40"
        >
          ↻ רענון
        </button>
      </div>
    </div>

    {loading ? (
      <div className="space-y-2 animate-pulse">
        <div className="h-4 bg-violet-100 rounded w-2/3" />
        <div className="h-3 bg-violet-100/70 rounded w-full" />
        <div className="h-3 bg-violet-100/70 rounded w-11/12" />
        <div className="h-3 bg-violet-100/70 rounded w-4/5" />
      </div>
    ) : error ? (
      <div className="text-sm text-slate-500">{error}</div>
    ) : ai ? (
      <>
        {ai.headline && <p className="font-bold text-slate-800 mb-3">{ai.headline}</p>}
        <ul className="space-y-2">
          {ai.insights.map((x, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-700 leading-relaxed">
              <span className={`shrink-0 font-bold ${TONE_STYLE[x.tone].cls}`}>{TONE_STYLE[x.tone].icon}</span>
              <span>{x.text}</span>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-slate-400 mt-4">
          נוצר אוטומטית מהנתונים המסוכמים שבמסך. מומלץ לאמת לפני קבלת החלטות.
        </p>
      </>
    ) : null}
  </div>
);

export default AiSummaryCard;
