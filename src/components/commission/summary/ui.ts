// src/components/commission/summary/ui.ts
// פורמט, צבעים וסגנונות משותפים למסך סיכום העמלות

export const fmtInt = (v: number) =>
  Number(v || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 });

export const fmtMoney = (v: number) =>
  Number(v || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });

export const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

// Tailwind צריך מחלקות מלאות — לכן מפה קבועה ולא הרכבת מחרוזות
export const ACCENTS = {
  emerald: { border: 'border-r-emerald-500', text: 'text-emerald-600', bar: 'bg-emerald-500', ring: 'ring-emerald-300' },
  amber: { border: 'border-r-amber-500', text: 'text-amber-600', bar: 'bg-amber-500', ring: 'ring-amber-300' },
  indigo: { border: 'border-r-indigo-500', text: 'text-indigo-600', bar: 'bg-indigo-500', ring: 'ring-indigo-300' },
  sky: { border: 'border-r-sky-500', text: 'text-sky-600', bar: 'bg-sky-500', ring: 'ring-sky-300' },
  violet: { border: 'border-r-violet-500', text: 'text-violet-600', bar: 'bg-violet-500', ring: 'ring-violet-300' },
  slate: { border: 'border-r-slate-400', text: 'text-slate-800', bar: 'bg-slate-500', ring: 'ring-slate-300' },
} as const;

export type Accent = keyof typeof ACCENTS;
