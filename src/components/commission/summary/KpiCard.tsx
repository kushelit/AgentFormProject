'use client';
// src/components/commission/summary/KpiCard.tsx
import React from 'react';
import { ACCENTS, type Accent } from './ui';

interface Props {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent: Accent;
  active?: boolean;
  onClick?: () => void;
}

const KpiCard: React.FC<Props> = ({ title, value, sub, accent, active, onClick }) => {
  const a = ACCENTS[accent];
  const base = `text-right w-full bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 ${a.border}`;

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-slate-600 text-sm font-bold">{title}</div>
        {onClick && <span className="text-slate-400 text-[10px]">{active ? '▲' : '▼'}</span>}
      </div>
      <div className={`text-2xl font-black mt-1 truncate ${a.text}`}>{value}</div>
      {sub && <div className="text-[13px] leading-snug text-slate-500 mt-2">{sub}</div>}
    </>
  );

  if (!onClick) return <div className={base}>{inner}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      title="לחץ לפילוח לפי חברה"
      className={`${base} hover:shadow-md transition ${active ? `ring-2 ${a.ring}` : ''}`}
    >
      {inner}
    </button>
  );
};

export default KpiCard;