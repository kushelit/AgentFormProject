'use client';
// ═══════════════════════════════════════════════════════════════════
// src/components/commission/AnomalyPoliciesModal.tsx
// פוליסות חריגות: עמלה 0 / עמלה שלילית / פרמיה חיובית עם עמלה 0 או שלילית.
//
// בסיס החודש:
//   'ym'          — חודש פרסום (ברירת מחדל): /api/commission-comparison/by-ym, action 'anomalies'
//                   (אותה שרשרת חודש פרסום של דף ההשוואה והסקירה). בחירה מתוך חודשים עם טעינות.
//   'reportMonth' — חודש דיווח: /api/anomaly-policies (כמו קודם).
//
// לכל פוליסה: דוח (תבנית מקור), מוצר מקורי + מוצר מסווג (productMap של התבנית),
// קישור לכרטיס הלקוח.
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { resolveFromTemplate } from '@/utils/contractCommissionResolvers';
import { postJsonCached } from '@/lib/fetchCache';
import useOpenCustomer from '@/hooks/useOpenCustomer';
import ClassifiedProduct, { MATCH_LABEL, matchFromDebug } from '@/components/commission/summary/ClassifiedProduct';
import CustomerLink from '@/components/commission/summary/CustomerLink';
import CustomerIssueBar from '@/components/commission/summary/CustomerIssueBar';
import t from '@/components/commission/summary/table.module.css';
import type { ProductMatch } from '@/types/agentInsights';
import { premiumFieldShort } from '@/lib/premiumFields';
import { matchNoiseRule, NOISE_RULES, type NoiseRule } from '@/lib/anomalyRules';

// ─── Types ────────────────────────────────────────────────────────────────────

type AnomalyRow = {
  policyNumberKey: string;
  customerId: string;
  fullName?: string;
  product?: string;
  templateId: string;
  companyId: string;
  company: string;
  agentCode: string;
  reportMonth: string;
  ym?: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  commissionRate: number;
  validMonth?: string;
  /** הפוליסה קיימת בדוח אח (lib/anomalyRules → SIBLING_REPORTS) */
  siblingFound?: boolean;
  siblingCommission?: number;
  siblingTemplate?: string;
};

type HistoryRow = {
  reportMonth: string;
  agentCode: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  commissionRate: number;
  product?: string;
  customerId?: string;
  fullName?: string;
  templateId: string;
  validMonth?: string;
};

/** קטגוריות חריגה — נפרדות וממצות */
type AnomalyCategory = 'neg_prem_pos' | 'neg_prem_nonpos' | 'zero';
type AnomalyType = 'all' | AnomalyCategory;

const CATEGORY_META: Record<AnomalyCategory, { label: string; badge: string; card: string; cardActive: string; text: string }> = {
  neg_prem_pos: {
    label: 'עמלה שלילית · פרמיה חיובית',
    badge: 'bg-red-100 text-red-700 border-red-200',
    card: 'border-red-100 bg-red-50 hover:bg-red-100',
    cardActive: 'border-red-400 bg-red-100 ring-2 ring-red-400',
    text: 'text-red-600',
  },
  neg_prem_nonpos: {
    label: 'עמלה שלילית · פרמיה שלילית או 0',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    card: 'border-rose-100 bg-rose-50/60 hover:bg-rose-100',
    cardActive: 'border-rose-400 bg-rose-100 ring-2 ring-rose-400',
    text: 'text-rose-600',
  },
  zero: {
    label: 'עמלה 0',
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    card: 'border-orange-100 bg-orange-50 hover:bg-orange-100',
    cardActive: 'border-orange-400 bg-orange-100 ring-2 ring-orange-400',
    text: 'text-orange-600',
  },
};
const CATEGORIES: AnomalyCategory[] = ['neg_prem_pos', 'neg_prem_nonpos', 'zero'];

function categoryOf(r: { totalCommissionAmount: number; totalPremiumAmount: number }): AnomalyCategory {
  const comm = Number(r.totalCommissionAmount) || 0;
  const prem = Number(r.totalPremiumAmount) || 0;
  if (comm < 0) return prem > 0 ? 'neg_prem_pos' : 'neg_prem_nonpos';
  return 'zero';
}

type SortKey = 'fullName' | 'customerId' | 'policyNumberKey' | 'company' | 'commission' | 'premium' | 'product' | 'productRaw' | 'template' | 'reportMonth' | 'agentCode';
type MonthBasis = 'ym' | 'reportMonth';

type Props = {
  agentId: string;
  selectedYear: string;
  onClose: () => void;
};

type Resolved = { templateName: string; product: string; matchedBy: ProductMatch; premiumField: string };

const BASIS_LABEL: Record<MonthBasis, string> = { ym: 'חודש פרסום', reportMonth: 'חודש דיווח' };

/** תפריט נפתח: חץ קטן בצד שמאל, עם ריווח — הטקסט לא מוסתר */
const SELECT_CLS = 'text-sm border rounded-lg pr-3 pl-8 py-1.5 bg-white appearance-none cursor-pointer';
const SELECT_STYLE: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'left 0.6rem center',
  backgroundSize: '12px',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** 0 רק כשזה באמת 0. סכום קטן שאינו 0 מוצג בדיוק שלו (למשל -0.0012) ולא מעוגל ל-0 */
function fmtNum(v: number) {
  const n = Number(v) || 0;
  if (n === 0) return '0';
  if (Math.abs(n) < 0.01) return n.toLocaleString('he-IL', { maximumSignificantDigits: 2 });
  return n.toLocaleString('he-IL', { maximumFractionDigits: 2 });
}

function getDefaultMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (m === 0) return `${y - 1}-12`;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function commissionColor(amount: number) {
  if (amount < 0) return 'text-red-700 font-bold';
  if (amount === 0) return 'text-orange-600 font-bold';
  return 'text-gray-800';
}

/** חריגה רק כשהעמלה 0 בדיוק או שלילית */
const isAnomalyCommission = (v: any) => (Number(v) || 0) <= 0;

function premiumColor(premium: number, commission: number) {
  if (premium > 0 && commission <= 0) return 'text-red-600 font-bold';
  return 'text-gray-800';
}

function anomalyBadge(row: AnomalyRow) {
  const c = CATEGORY_META[categoryOf(row)];
  return { label: c.label, color: c.badge };
}

/** תבניות (לשם הדוח + פענוח מוצר) — נטען פעם אחת לכל פתיחת חלון */
function useTemplates() {
  const [templatesById, setTemplatesById] = useState<Record<string, any>>({});
  useEffect(() => {
    getDocs(collection(db, 'commissionTemplates'))
      .then((snap) => {
        const map: Record<string, any> = {};
        snap.forEach((d) => (map[d.id] = d.data()));
        setTemplatesById(map);
      })
      .catch(() => undefined);
  }, []);

  const resolve = useMemo(() => {
    const cache = new Map<string, Resolved>();
    return (templateId: string, product?: string): Resolved => {
      const k = `${templateId}|${product ?? ''}`;
      let v = cache.get(k);
      if (!v) {
        const tpl = templatesById[templateId];
        const r = resolveFromTemplate(tpl, product);
        v = {
          templateName: String(tpl?.Name || tpl?.type || templateId || '-'),
          product: r.canonicalProduct || 'אחר',
          matchedBy: matchFromDebug(r),
          premiumField: r.premiumFieldUsed || '',
        };
        cache.set(k, v);
      }
      return v;
    };
  }, [templatesById]);

  return resolve;
}

// ─── PolicyHistoryModal ───────────────────────────────────────────────────────

function PolicyHistoryModal({
  agentId,
  companyId,
  policyNumberKey,
  fullName,
  customerId,
  resolve,
  onClose,
}: {
  agentId: string;
  companyId: string;
  policyNumberKey: string;
  fullName?: string;
  customerId?: string;
  resolve: (templateId: string, product?: string) => Resolved;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await postJsonCached('/api/policy-history', { agentId, companyId, policyNumberKey });
        if (!cancelled) setRows(data.rows ?? []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, companyId, policyNumberKey]);

  const exportHistory = () => {
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(
      rows.map((r) => {
        const res = resolve(r.templateId, r.product);
        return {
          'חודש דיווח': r.reportMonth,
          'מספר סוכן': r.agentCode,
          'דוח': res.templateName,
          'מוצר': r.product ?? '',
          'מוצר מסווג': res.product,
          'פרמיה': r.totalPremiumAmount,
          'עמלה': r.totalCommissionAmount,
          '% עמלה': r.commissionRate,
          'חודש תחילה': r.validMonth ?? '',
        };
      })
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'היסטוריה');
    XLSX.writeFile(wb, `היסטוריה_${policyNumberKey}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center" dir="rtl">
      <div className="bg-white w-[min(1000px,95vw)] max-h-[80vh] overflow-auto rounded-2xl shadow-2xl">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-10">
          <div>
            <div className="font-bold text-gray-900 text-base">היסטוריית פוליסה: {policyNumberKey}</div>
            {fullName && (
              <div className="text-sm text-gray-500 mt-0.5">
                {fullName}
                {customerId && <span className="mr-2 text-gray-400">· ת״ז: {customerId}</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportHistory}
              disabled={!rows.length}
              className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-40"
            >
              ייצוא אקסל
            </button>
            <button onClick={onClose} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50">
              סגור
            </button>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="py-12 text-center text-gray-400 animate-pulse">טוען...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-gray-400">לא נמצאו רשומות</div>
          ) : (
            <table className={`${t.cleanTable} text-sm`}>
              <thead>
                <tr>
                  <th className="px-3 py-2">חודש דיווח</th>
                  <th className={`px-3 py-2 ${t.center}`}>מספר סוכן</th>
                  <th className={`px-3 py-2 ${t.center}`}>דוח</th>
                  <th className={`px-3 py-2 ${t.center}`}>מוצר</th>
                  <th className={`px-3 py-2 ${t.center}`}>מוצר מסווג</th>
                  <th className={`px-3 py-2 ${t.center}`}>פרמיה/צבירה</th>
                  <th className={`px-3 py-2 ${t.center}`}>עמלה</th>
                  <th className={`px-3 py-2 ${t.center}`}>% עמלה</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isAnomaly = isAnomalyCommission(r.totalCommissionAmount);
                  const res = resolve(r.templateId, r.product);
                  return (
                    <tr key={i} className={isAnomaly ? 'bg-red-50/40' : ''}>
                      <td className="px-3 py-2 font-medium tabular-nums">{r.reportMonth}</td>
                      <td className={`px-3 py-2 text-gray-600 tabular-nums ${t.center}`}>{r.agentCode}</td>
                      <td className={`px-3 py-2 text-gray-500 text-xs ${t.center}`}>{res.templateName}</td>
                      <td className={`px-3 py-2 text-gray-500 ${t.center}`}>{r.product || '-'}</td>
                      <td className={`px-3 py-2 ${t.center}`}>
                        <ClassifiedProduct product={res.product} matchedBy={res.matchedBy} />
                      </td>
                      <td className={`px-3 py-2 tabular-nums ${premiumColor(r.totalPremiumAmount, r.totalCommissionAmount)} ${t.center}`}>
                        {fmtNum(r.totalPremiumAmount)}
                      </td>
                      <td className={`px-3 py-2 tabular-nums ${commissionColor(r.totalCommissionAmount)} ${t.center}`}>
                        {fmtNum(r.totalCommissionAmount)}
                        {r.totalCommissionAmount < 0 && ' ⚠️'}
                        {r.totalCommissionAmount === 0 && r.totalPremiumAmount > 0 && ' 🔴'}
                      </td>
                      <td className={`px-3 py-2 text-gray-600 tabular-nums ${t.center}`}>{fmtNum(r.commissionRate)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AnomalyPoliciesModal ─────────────────────────────────────────────────────

export default function AnomalyPoliciesModal({ agentId, onClose }: Props) {
  const resolve = useTemplates();
  const { openCustomer, isPending, issue, clearIssue } = useOpenCustomer(agentId);

  const [basis, setBasis] = useState<MonthBasis>('ym');
  const [rows, setRows] = useState<AnomalyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadedLabel, setLoadedLabel] = useState('');

  // חודש פרסום — רק חודשים עם טעינות
  const [availableYms, setAvailableYms] = useState<string[]>([]);
  const [ymsLoading, setYmsLoading] = useState(true);
  const [selectedYm, setSelectedYm] = useState('');
  // חודש דיווח
  const [selectedReportMonth, setSelectedReportMonth] = useState<string>(getDefaultMonth);

  const selectedMonth = basis === 'ym' ? selectedYm : selectedReportMonth;

  const [filterType, setFilterType] = useState<AnomalyType>('all');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterTemplate, setFilterTemplate] = useState('');
  const [filterAgentCode, setFilterAgentCode] = useState('');
  const [search, setSearch] = useState('');

  const [historyPolicy, setHistoryPolicy] = useState<AnomalyRow | null>(null);
  // שורות שסוננו כרעש לפי lib/anomalyRules — מוסתרות; לחיצה על כלל מציגה רק את השורות שלו
  const [noiseFocus, setNoiseFocus] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'commission', dir: 'asc' });


  // ─── טעינה ─────────────────────────────────────────────────────────────
  const load = async (b: MonthBasis = basis, month: string = selectedMonth) => {
    if (!month) return;
    setLoading(true);
    setError(null);
    setHasSearched(false);
    try {
      const data =
        b === 'ym'
          ? await postJsonCached('/api/commission-comparison/by-ym', { agentId, action: 'anomalies', ym: month })
          : await postJsonCached('/api/anomaly-policies', { agentId, reportMonth: month });
      // הגנה גם במצב "חודש דיווח" (route ישן): עמלה חיובית — גם קטנה — אינה חריגה
      const onlyAnomalies = (data.rows ?? []).filter((r: AnomalyRow) => isAnomalyCommission(r.totalCommissionAmount));
      setRows(onlyAnomalies);
      setNoiseFocus(null);
      setTotal(onlyAnomalies.length);
      setLoadedLabel(`${BASIS_LABEL[b]}: ${month}`);
      setHasSearched(true);
    } catch (e: any) {
      const msg = String(e?.data?.error || e?.message || e);
      setError(
        /index/i.test(msg)
          ? 'חסר אינדקס ב-Firestore לשאילתת החריגות. בלוג השרת (הטרמינל) מופיע לינק ליצירתו — לחץ עליו, המתן כמה דקות לבנייה, נסה שוב.'
          : `שגיאה בטעינה: ${msg}`
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  // חודשי פרסום זמינים → בחירת האחרון וטעינה אוטומטית
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setYmsLoading(true);
      try {
        const d = await postJsonCached('/api/commission-comparison/by-ym', { agentId, action: 'listYms' });
        if (cancelled) return;
        const yms: string[] = d.yms ?? [];
        setAvailableYms(yms);
        if (yms.length) {
          setSelectedYm(yms[0]);
          load('ym', yms[0]);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setYmsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const switchBasis = (b: MonthBasis) => {
    if (b === basis) return;
    setBasis(b);
    setRows([]);
    setHasSearched(false);
    setFilterTemplate('');
    const month = b === 'ym' ? selectedYm : selectedReportMonth;
    if (month) load(b, month);
  };

  // ─── כללי רעש ──────────────────────────────────────────────────────────
  const noiseOf = useMemo(() => {
    const m = new Map<AnomalyRow, NoiseRule | null>();
    rows.forEach((r) => {
      const res = resolve(r.templateId, r.product);
      m.set(
        r,
        matchNoiseRule({
          commission: Number(r.totalCommissionAmount) || 0,
          premium: Number(r.totalPremiumAmount) || 0,
          premiumField: res.premiumField,
          product: res.product,
          rawProduct: r.product || '',
          templateId: r.templateId,
          siblingFound: r.siblingFound,
          siblingCommission: r.siblingCommission,
          siblingTemplate: r.siblingTemplate ? resolve(r.siblingTemplate, '').templateName : undefined,
        })
      );
    });
    return m;
  }, [rows, resolve]);

  const noiseCounts = useMemo(() => {
    const c: Record<string, number> = {};
    noiseOf.forEach((rule) => rule && (c[rule.id] = (c[rule.id] || 0) + 1));
    return c;
  }, [noiseOf]);
  const noiseTotal = Object.values(noiseCounts).reduce((a, b) => a + b, 0);

  /** החריגות האמיתיות (או הכל, כשבחרו להציג גם את הרעש) */
  const baseRows = useMemo(
    () => (noiseFocus ? rows.filter((r) => noiseOf.get(r)?.id === noiseFocus) : rows.filter((r) => !noiseOf.get(r))),
    [rows, noiseOf, noiseFocus]
  );
  const focusedRule = noiseFocus ? NOISE_RULES.find((r) => r.id === noiseFocus) ?? null : null;

  // ─── סינון ─────────────────────────────────────────────────────────────
  // אפשרויות הסינון — רק ממה שמוצג בפועל (בלי שורות שסוננו כתקינות), כדי שלא תופיע חברה בלי חריגות
  const companies = useMemo(() => Array.from(new Set(baseRows.map((r) => r.company))).sort(), [baseRows]);
  const agentCodes = useMemo(() => Array.from(new Set(baseRows.map((r) => r.agentCode).filter(Boolean))).sort(), [baseRows]);
  // דוחות לבחירה — רק של החברה שנבחרה (אם נבחרה)
  const templateOptions = useMemo(() => {
    const m = new Map<string, string>();
    baseRows.forEach((r) => {
      if (filterCompany && r.company !== filterCompany) return;
      if (r.templateId) m.set(r.templateId, resolve(r.templateId, r.product).templateName);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'he'));
  }, [baseRows, filterCompany, resolve]);

  const filtered = useMemo(() => {
    const list = baseRows.filter((r) => {
      if (filterType !== 'all' && categoryOf(r) !== filterType) return false;
      if (filterCompany && r.company !== filterCompany) return false;
      if (filterTemplate && r.templateId !== filterTemplate) return false;
      if (filterAgentCode && r.agentCode !== filterAgentCode) return false;
      if (search) {
        const q = search.toLowerCase();
        const res = resolve(r.templateId, r.product);
        const match =
          r.policyNumberKey?.toLowerCase().includes(q) ||
          r.fullName?.toLowerCase().includes(q) ||
          r.customerId?.toLowerCase().includes(q) ||
          r.product?.toLowerCase().includes(q) ||
          res.product.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    const val = (r: AnomalyRow): string | number => {
      switch (sort.key) {
        case 'commission': return Number(r.totalCommissionAmount) || 0;
        case 'premium': return Number(r.totalPremiumAmount) || 0;
        case 'product': return resolve(r.templateId, r.product).product;
        case 'productRaw': return r.product || '';
        case 'template': return resolve(r.templateId, r.product).templateName;
        case 'fullName': return r.fullName || '';
        default: return String((r as any)[sort.key] ?? '');
      }
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.slice().sort((x, y) => {
      const a = val(x);
      const b = val(y);
      return (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'he')) * dir;
    });
  }, [baseRows, filterType, filterCompany, filterTemplate, filterAgentCode, search, resolve, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'commission' || key === 'premium' ? 'asc' : 'asc' }));
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  // הקוביות סופרות רק חריגות אמיתיות (בלי הרעש), גם כשבחרו להציג אותו
  const realRows = useMemo(() => rows.filter((r) => !noiseOf.get(r)), [rows, noiseOf]);
  const stats = useMemo(() => {
    const c: Record<AnomalyCategory, number> = { neg_prem_pos: 0, neg_prem_nonpos: 0, zero: 0 };
    realRows.forEach((r) => c[categoryOf(r)]++);
    return c;
  }, [realRows]);

  const exportToExcel = () => {
    if (!filtered.length) return;
    const ws = XLSX.utils.json_to_sheet(
      filtered.map((r) => {
        const res = resolve(r.templateId, r.product);
        return {
          'סוג חריגה': noiseOf.get(r) ? `לא חריגה · ${noiseOf.get(r)!.label}` : anomalyBadge(r).label,
          'פוליסה': r.policyNumberKey,
          'ת״ז': r.customerId,
          'לקוח': r.fullName ?? '',
          'חברה': r.company,
          'דוח': res.templateName,
          'מוצר': r.product ?? '',
          'מוצר מסווג': res.product,
          'זיהוי': MATCH_LABEL[res.matchedBy],
          ...(basis === 'ym' ? { 'חודש פרסום': r.ym ?? selectedMonth } : {}),
          'חודש דיווח': r.reportMonth,
          'מספר סוכן': r.agentCode,
          'פרמיה/צבירה': r.totalPremiumAmount,
          'סוג סכום': premiumFieldShort(res.premiumField),
          'עמלה': r.totalCommissionAmount,
          '% עמלה': r.commissionRate,
        };
      })
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'פוליסות חריגות');
    XLSX.writeFile(wb, `פוליסות_חריגות_${basis === 'ym' ? 'פרסום' : 'דיווח'}_${selectedMonth}.xlsx`);
  };

  const hasFilters = filterType !== 'all' || filterCompany || filterTemplate || filterAgentCode || search;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center" dir="rtl">
        <div className="bg-white w-[min(1400px,96vw)] h-[90vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col">
          {/* Header */}
          <div className="shrink-0 bg-white border-b px-6 py-4 flex items-center justify-between z-20">
            <div>
              <h2 className="text-lg font-bold text-gray-900">⚠️ פוליסות חריגות</h2>
              {hasSearched && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {loadedLabel} · {realRows.length} חריגות{noiseTotal ? ` (+${noiseTotal} שסוננו כרעש)` : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasSearched && (
                <button
                  onClick={exportToExcel}
                  disabled={!filtered.length}
                  className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-40"
                >
                  ייצוא אקסל ({filtered.length})
                </button>
              )}
              <button onClick={onClose} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50">
                סגור
              </button>
            </div>
          </div>

          <CustomerIssueBar agentId={agentId} issue={issue} onClose={clearIssue} />

          {/* Month picker */}
          <div className="shrink-0 px-6 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
            <div className="inline-flex bg-white border rounded-lg p-0.5 text-sm">
              {(['ym', 'reportMonth'] as MonthBasis[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => switchBasis(b)}
                  className={`px-3 py-1 rounded-md font-bold transition ${
                    basis === b ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {BASIS_LABEL[b]}
                </button>
              ))}
            </div>

            {basis === 'ym' ? (
              <select
                value={selectedYm}
                onChange={(e) => setSelectedYm(e.target.value)}
                disabled={ymsLoading || !availableYms.length}
                className={`${SELECT_CLS} min-w-[140px]`} style={SELECT_STYLE}
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

            <button
              onClick={() => load()}
              disabled={!selectedMonth || loading}
              className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {loading ? 'טוען...' : 'טען'}
            </button>
            <span className="text-xs text-gray-500">
              {basis === 'ym' ? 'כל מה שפורסם בחודש — כמו בטבלת "לפי חודש פרסום"' : 'לפי חודש הדיווח שבתוך הקובץ'}
            </span>
          </div>

          <div className="px-4 py-4 flex-1 min-h-0 flex flex-col">
            {error ? (
              <div className="p-4 text-sm text-red-600 bg-red-50 rounded-xl">{error}</div>
            ) : loading ? (
              <div className="py-20 text-center text-gray-400 animate-pulse text-sm">טוען נתונים...</div>
            ) : !hasSearched ? (
              <div className="py-20 text-center text-gray-400 text-sm">
                {ymsLoading ? 'טוען חודשי פרסום…' : 'בחרי חודש ולחצי טען'}
              </div>
            ) : (
              <>
                {/* Noise rules — שורות שנראות חריגות אבל תקינות */}
                {noiseTotal > 0 && !focusedRule && (
                  <div className="shrink-0 mb-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                    <span className="text-slate-700 ml-1">
                      ✓ <b>{noiseTotal}</b> שורות שנראות חריגות אבל הן תקינות. לחץ לפירוט:
                    </span>
                    {NOISE_RULES.filter((rule) => noiseCounts[rule.id]).map((rule) => (
                      <button
                        key={rule.id}
                        type="button"
                        onClick={() => {
                          setNoiseFocus(rule.id);
                          setFilterType('all');
                          setFilterCompany('');
                          setFilterTemplate('');
                          setFilterAgentCode('');
                        }}
                        title={rule.description}
                        className="px-2.5 py-1 rounded-full bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold"
                      >
                        {rule.label} ({noiseCounts[rule.id]})
                      </button>
                    ))}
                  </div>
                )}

                {focusedRule && (
                  <div className="shrink-0 mb-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-[260px]">
                      <div className="font-bold text-emerald-900">
                        ✓ {focusedRule.label} · {noiseCounts[focusedRule.id] ?? 0} שורות — לא חריגות
                      </div>
                      <div className="text-sm text-emerald-900/80 mt-0.5 leading-relaxed">{focusedRule.description}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNoiseFocus(null);
                        setFilterCompany('');
                        setFilterTemplate('');
                        setFilterAgentCode('');
                      }}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-sm font-bold hover:bg-emerald-100"
                    >
                      ← חזרה לחריגות
                    </button>
                  </div>
                )}

                {/* Stats */}
                <div className={`shrink-0 grid grid-cols-3 gap-3 mb-4 ${focusedRule ? 'hidden' : ''}`}>
                  {CATEGORIES.map((cat) => {
                    const m = CATEGORY_META[cat];
                    const active = filterType === cat;
                    return (
                      <div
                        key={cat}
                        onClick={() => setFilterType((prev) => (prev === cat ? 'all' : cat))}
                        className={`rounded-xl border p-4 text-center cursor-pointer transition ${active ? m.cardActive : m.card}`}
                      >
                        <div className={`text-xs font-bold mb-1 ${m.text}`}>{m.label}</div>
                        <div className={`text-3xl font-black ${m.text}`}>{stats[cat]}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Filters */}
                <div className="shrink-0 flex flex-wrap gap-2 mb-3">
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value as AnomalyType)} className={`${SELECT_CLS}`} style={SELECT_STYLE}>
                    <option value="all">כל החריגות</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_META[cat].label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterCompany}
                    onChange={(e) => {
                      setFilterCompany(e.target.value);
                      setFilterTemplate(''); // דוח של חברה אחרת כבר לא רלוונטי
                    }}
                    className={`${SELECT_CLS}`} style={SELECT_STYLE}
                  >
                    <option value="">כל החברות</option>
                    {companies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select value={filterTemplate} onChange={(e) => setFilterTemplate(e.target.value)} className={`${SELECT_CLS} max-w-[240px]`} style={SELECT_STYLE}>
                    <option value="">כל הדוחות</option>
                    {templateOptions.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>

                  <select value={filterAgentCode} onChange={(e) => setFilterAgentCode(e.target.value)} className={`${SELECT_CLS}`} style={SELECT_STYLE}>
                    <option value="">כל מספרי הסוכן</option>
                    {agentCodes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    placeholder="חיפוש פוליסה / לקוח / ת״ז / מוצר..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="text-sm border rounded-lg px-3 py-1.5 bg-white flex-1 min-w-[180px]"
                  />

                  {hasFilters && (
                    <button
                      onClick={() => {
                        setFilterType('all');
                        setFilterCompany('');
                        setFilterTemplate('');
                        setFilterAgentCode('');
                        setSearch('');
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2"
                    >
                      נקה סינון
                    </button>
                  )}
                </div>

                {/* Table */}
                {filtered.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">לא נמצאו פוליסות חריגות לפי הסינון הנוכחי</div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-gray-200">
                    <table className={`${t.cleanTable} text-[13px]`}>
                      <thead className="sticky top-0 z-10">
                        <tr>
                          {(
                            [
                              [null, 'סוג חריגה', false],
                              ['fullName', 'לקוח', false],
                              ['customerId', 'ת״ז', true],
                              ['policyNumberKey', 'פוליסה', true],
                              ['company', 'חברה', true],
                              ['commission', 'עמלה', true],
                              ['premium', 'פרמיה/צבירה', true],
                              ['product', 'מוצר מסווג', true],
                              ['productRaw', 'מוצר', true],
                              ['template', 'דוח', true],
                              ['reportMonth', 'חודש דיווח', true],
                              ['agentCode', 'מס׳ סוכן', true],
                              [null, '', true],
                            ] as Array<[SortKey | null, string, boolean]>
                          ).map(([key, label, centered], i) => (
                            <th
                              key={i}
                              onClick={key ? () => toggleSort(key) : undefined}
                              className={`px-2 py-2 whitespace-nowrap ${centered ? t.center : ''} ${key ? 'cursor-pointer select-none hover:text-indigo-700' : ''}`}
                              title={key ? 'מיון' : undefined}
                            >
                              {label}
                              {key && sortMark(key)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r, i) => {
                          const noise = noiseOf.get(r);
                          const badge = noise
                            ? { label: `לא חריגה · ${noise.label}`, color: 'bg-slate-100 text-slate-500 border-slate-200' }
                            : anomalyBadge(r);
                          const res = resolve(r.templateId, r.product);
                          return (
                            <tr
                              key={`${r.policyNumberKey}_${r.customerId}_${r.templateId}_${r.reportMonth}_${i}`}
                              className={noise ? 'opacity-60' : ''}
                            >
                              <td className="px-2 py-1.5 whitespace-nowrap">
                                <span
                                  className={`text-[11px] leading-none px-2 py-1 rounded-full border font-medium ${badge.color}`}
                                  title={
                                    noise
                                      ? noise.explain
                                        ? noise.explain({
                                            commission: Number(r.totalCommissionAmount) || 0,
                                            premium: Number(r.totalPremiumAmount) || 0,
                                            premiumField: res.premiumField,
                                            product: res.product,
                                            rawProduct: r.product || '',
                                            templateId: r.templateId,
                                            siblingFound: r.siblingFound,
                                            siblingCommission: r.siblingCommission,
                                            siblingTemplate: r.siblingTemplate ? resolve(r.siblingTemplate, '').templateName : undefined,
                                          })
                                        : noise.description
                                      : undefined
                                  }
                                >
                                  {badge.label}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 font-semibold whitespace-nowrap">
                                <CustomerLink
                                  customerId={r.customerId}
                                  label={r.fullName || '-'}
                                  name={r.fullName ?? ''}
                                  pending={isPending(r.customerId)}
                                  onOpen={openCustomer}
                                />
                              </td>
                              <td className={`px-2 py-1.5 tabular-nums whitespace-nowrap ${t.center}`}>
                                <CustomerLink customerId={r.customerId} label={r.customerId || '-'} name={r.fullName ?? ''} pending={false} onOpen={openCustomer} className="text-slate-600" />
                              </td>
                              <td className={`px-2 py-1.5 font-mono text-xs text-gray-700 whitespace-nowrap ${t.center}`}>{r.policyNumberKey}</td>
                              <td className={`px-2 py-1.5 text-gray-600 whitespace-nowrap ${t.center}`}>{r.company}</td>
                              <td className={`px-2 py-1.5 tabular-nums whitespace-nowrap ${commissionColor(r.totalCommissionAmount)} ${t.center}`}>
                                {fmtNum(r.totalCommissionAmount)}
                              </td>
                              <td className={`px-2 py-1.5 tabular-nums whitespace-nowrap ${premiumColor(r.totalPremiumAmount, r.totalCommissionAmount)} ${t.center}`}>
                                {fmtNum(r.totalPremiumAmount)}
                                {res.premiumField && (
                                  <div className="text-[10px] font-normal text-slate-400 leading-tight">{premiumFieldShort(res.premiumField)}</div>
                                )}
                              </td>
                              <td className={`px-2 py-1.5 ${t.center}`}>
                                <ClassifiedProduct product={res.product} matchedBy={res.matchedBy} />
                              </td>
                              <td className={`px-2 py-1.5 text-gray-500 whitespace-nowrap ${t.center}`}>{r.product || '-'}</td>
                              <td className={`px-2 py-1.5 text-gray-500 text-xs min-w-[110px] max-w-[170px] leading-snug ${t.center}`}>{res.templateName}</td>
                              <td className={`px-2 py-1.5 text-gray-600 tabular-nums whitespace-nowrap ${t.center}`}>{r.reportMonth}</td>
                              <td className={`px-2 py-1.5 text-gray-600 tabular-nums whitespace-nowrap ${t.center}`}>{r.agentCode ?? '-'}</td>
                              <td className={`px-2 py-1.5 ${t.center}`}>
                                <button
                                  onClick={() => setHistoryPolicy(r)}
                                  className="text-[11px] px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 whitespace-nowrap"
                                >
                                  היסטוריה
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {historyPolicy && (
        <PolicyHistoryModal
          agentId={agentId}
          companyId={historyPolicy.companyId}
          policyNumberKey={historyPolicy.policyNumberKey}
          fullName={historyPolicy.fullName}
          customerId={historyPolicy.customerId}
          resolve={resolve}
          onClose={() => setHistoryPolicy(null)}
        />
      )}
    </>
  );
}