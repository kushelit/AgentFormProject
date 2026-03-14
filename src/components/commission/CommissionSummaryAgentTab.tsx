'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { Spinner } from '@/components/Spinner';
import { ChevronLeft, ChevronRight, PieChart } from 'lucide-react';
import AgentImportChecklist from '@/components/commission/AgentImportChecklist';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Pie,
  Cell,
} from 'recharts';

import dynamic from 'next/dynamic';


import * as XLSX from 'xlsx';
import { resolveFromTemplate } from '@/utils/contractCommissionResolvers';
// אם תרצי להשתמש במנוע המלא:
import { buildContractComparisonRow } from '@/utils/buildContractComparisonRow';
import useFetchMD from '@/hooks/useMD';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

interface CommissionSummary {
  agentId: string;
  agentCode: string;
  reportMonth: string; // YYYY-MM
  templateId: string;
  totalCommissionAmount: number;
}

interface CompanyMap {
  [templateId: string]: string;
}

interface AgentMonthMap {
  [company: string]: {
    [agentCode: string]: {
      [month: string]: number;
    };
  };
}

interface MonthlyTotalRow {
  month: string;
  total: number;
}

type PerCompanyRow = Record<string, string | number>;

interface CommissionSummaryApiResponse {
  summaries: CommissionSummary[];
  companyMap: CompanyMap;
  companyIdByName: Record<string, string>;
  summaryByMonthCompany: Record<string, Record<string, number>>;
  summaryByCompanyAgentMonth: AgentMonthMap;
  allMonths: string[];
  allCompanies: string[];
  monthlyTotalsData: MonthlyTotalRow[];
  perCompanyOverMonthsData: PerCompanyRow[];
}

type DrillKey = { companyId: string; agentCode: string; month: string } | null;

type DrillRow = {
  policyNumberKey: string;
  customerId: string;
  fullName?: string;
  product?: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  commissionRate?: number;
  validMonth?: string;
  runId?: string;
  templateId: string;    
  productGroup?: string; 
  companyName?: string;
};


const CommissionSummaryAgentTab: React.FC = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [summaries, setSummaries] = useState<CommissionSummary[]>([]);
  const [companyMap, setCompanyMap] = useState<CompanyMap>({});
  const [summaryByMonthCompany, setSummaryByMonthCompany] = useState<
    Record<string, Record<string, number>>
  >({});
  const [summaryByCompanyAgentMonth, setSummaryByCompanyAgentMonth] =
    useState<AgentMonthMap>({});
  const [allMonths, setAllMonths] = useState<string[]>([]);
  const [allCompanies, setAllCompanies] = useState<string[]>([]);
  const [monthlyTotalsData, setMonthlyTotalsData] = useState<MonthlyTotalRow[]>(
    []
  );
  const [perCompanyOverMonthsData, setPerCompanyOverMonthsData] = useState<
    PerCompanyRow[]
  >([]);

  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<{ month: string; company: string } | null>(
    null
  );
  const drillScrollerRef = useRef<HTMLDivElement>(null);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(
    currentYear.toString()
  );

  const [companyIdByName, setCompanyIdByName] = useState<Record<string,string>>({});
  const [showChecklist, setShowChecklist] = useState(false);


  const handleToggleExpandCompany = (company: string) => {
    setExpanded((prev) =>
      prev?.company === company ? null : { month: 'ALL', company }
    );
  };

  const [drill, setDrill] = useState<DrillKey>(null);
  const [drillRows, setDrillRows] = useState<DrillRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);


  useEffect(() => {
    const fetchSummaries = async () => {
      if (!selectedAgentId || !selectedYear) {
        setSummaries([]);
        setCompanyMap({});
        setSummaryByMonthCompany({});
        setSummaryByCompanyAgentMonth({});
        setAllMonths([]);
        setAllCompanies([]);
        setMonthlyTotalsData([]);
        setPerCompanyOverMonthsData([]);
        return;
      }

      setLoading(true);

      try {
        const res = await fetch('/api/commission-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: selectedAgentId,
            year: selectedYear,
          }),
        });

        if (!res.ok) {
          setSummaries([]);
  setCompanyMap({});
  setCompanyIdByName({});
  setSummaryByMonthCompany({});
  setSummaryByCompanyAgentMonth({});
  setAllMonths([]);
  setAllCompanies([]);
  setMonthlyTotalsData([]);
  setPerCompanyOverMonthsData([]);
          return;
        }

        const data: CommissionSummaryApiResponse = await res.json();

        setSummaries(data.summaries ?? []);
        setCompanyMap(data.companyMap ?? {});
        setCompanyIdByName(data.companyIdByName ?? {});
        setSummaryByMonthCompany(data.summaryByMonthCompany ?? {});
        setSummaryByCompanyAgentMonth(data.summaryByCompanyAgentMonth ?? {});
        setAllMonths(data.allMonths ?? []);
        setAllCompanies(data.allCompanies ?? []);
        setMonthlyTotalsData(data.monthlyTotalsData ?? []);
        setPerCompanyOverMonthsData(data.perCompanyOverMonthsData ?? []);
      } catch (err) {
        // console.error('fetchSummaries error:', err);
        setSummaries([]);
        setCompanyMap({});
        setSummaryByMonthCompany({});
        setSummaryByCompanyAgentMonth({});
        setAllMonths([]);
        setAllCompanies([]);
        setMonthlyTotalsData([]);
        setPerCompanyOverMonthsData([]);
        setCompanyIdByName({});
      } finally {
        setLoading(false);
      }
    };

    fetchSummaries();
  }, [selectedAgentId, selectedYear]);

  const handleToggleExpand = (month: string, company: string) => {
    if (expanded?.month === month && expanded.company === company) {
      setExpanded(null);
    } else {
      setExpanded({ month, company });
    }
  };

  const selectedCompany = expanded?.company;

  const formatCurrency = (v: number | string) =>
    Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 });

  const palette = [
    '#2563eb',
    '#16a34a',
    '#dc2626',
    '#7c3aed',
    '#f59e0b',
    '#0891b2',
    '#fb7185',
    '#84cc16',
    '#0ea5e9',
    '#a855f7',
  ];


  async function openDrill(companyId: string, agentCode: string, month: string) {
    setDrill({ companyId, agentCode, month });
    setDrillLoading(true);
    setDrillRows([]);
  
    try {
      const res = await fetch('/api/commission-summary-drilldown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId,
          companyId,
          agentCode,
          reportMonth: month, // YYYY-MM
        }),
      });
  
      if (!res.ok) return;
      const data = await res.json();
      setDrillRows(data.rows ?? []);
    } finally {
      setDrillLoading(false);
    }
  }
  

  const exportDrillToExcel = () => {
    if (!drill || drillRows.length === 0) return;
  
    const rowsForExcel = drillRows.map((r) => ({
      'פוליסה': r.policyNumberKey,
      'ת״ז': r.customerId ?? '', 
      'לקוח': r.fullName ?? '',
      'מוצר': r.product ?? '',
      'פרמיה': r.totalPremiumAmount,
      'עמלה': r.totalCommissionAmount,
      '% עמלה': r.commissionRate,
    }));
  
    const ws = XLSX.utils.json_to_sheet(rowsForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'פירוט פוליסות');
  
    const fileName = `פירוט_פוליסות_${drill.agentCode}_${drill.month}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };
  
  const [showYearlyAnalysis, setShowYearlyAnalysis] = useState(false);

// שליפת המילונים מה-Hook הקיים שלך
const { 
  productMap: systemProductMap, // שימוש ב-alias כדי להתאים לקוד הניתוח
  productGroupMap,
  productToGroupMap 
} = useFetchMD();

// תצטרכי גם להוסיף State לתבניות אם הן לא מגיעות מה-API השנתי
const [templatesById, setTemplatesById] = useState<Record<string, any>>({});

const [yearlyPolicies, setYearlyPolicies] = useState<DrillRow[]>([]);
const [isYearlyLoading, setIsYearlyLoading] = useState(false);

const yearlyInsights = useMemo(() => {
  if (!summaries.length) return null;

  // 1. פילוח לפי חברות (סך הכל שנתי לכל חברה)
  const companyDistribution = allCompanies.map(name => {
    const total = summaries
      .filter(s => companyMap[s.templateId] === name)
      .reduce((sum, s) => sum + s.totalCommissionAmount, 0);
    return { name, total };
  }).sort((a, b) => b.total - a.total);

  // 2. זיהוי חודש השיא וחודש השפל
  const monthlyTotals = monthlyTotalsData.sort((a, b) => b.total - a.total);

  return {
    totalYearly: monthlyTotals.reduce((sum, m) => sum + m.total, 0),
    topCompany: companyDistribution[0],
    bestMonth: monthlyTotals[0],
    companyDistribution
  };
}, [summaries, allCompanies, companyMap, monthlyTotalsData]);

useEffect(() => {
  const fetchYearlyData = async () => {
    if (!selectedAgentId || !selectedYear || !showYearlyAnalysis) return;
    
    setIsYearlyLoading(true);
    // איפוס הנתונים הקודמים כדי למנוע בלבול ב-UI
    setYearlyPolicies([]); 

    try {
      const res = await fetch('/api/commission-summary-yearly-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, year: selectedYear }),
      });
      
      const data = await res.json();
      setYearlyPolicies(data.rows || []);
    } catch (err) {
      console.error("Error fetching yearly data:", err);
    } finally {
      setIsYearlyLoading(false);
    }
  };

  fetchYearlyData();
}, [showYearlyAnalysis, selectedYear, selectedAgentId]); // 👈 התלויות החדשות
// הפעלת הטעינה כשלוחצים על הכפתור של הניתוח השנתי

useEffect(() => {
  const fetchTemplates = async () => {
    const querySnapshot = await getDocs(collection(db, 'commissionTemplates'));
    const tempMap: Record<string, any> = {};
    querySnapshot.forEach(doc => {
      tempMap[doc.id] = doc.data();
    });
    setTemplatesById(tempMap);
  };
  fetchTemplates();
}, []);

const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

const productSummary = useMemo(() => {
  if (!yearlyPolicies.length || !productToGroupMap) return [];
  
  const groups: Record<string, any> = {};

  yearlyPolicies.forEach(row => {
    const template = templatesById[row.templateId];
    const resolved = resolveFromTemplate(template, row.product);
    const productName = resolved.canonicalProduct || row.product || 'אחר';
    const groupId = productToGroupMap[productName] || row.productGroup || '';
    const groupName = productGroupMap[groupId] || (groupId ? `קבוצה ${groupId}` : 'ללא סיווג');
    const amount = row.totalCommissionAmount || 0;
    const company = row.companyName || 'חברה לא ידועה';

    if (!groups[groupName]) {
      groups[groupName] = { total: 0, products: {} };
    }
    
    // אגרגציה לפי מוצר בתוך הקבוצה
    if (!groups[groupName].products[productName]) {
      groups[groupName].products[productName] = { total: 0, companies: {} };
    }

    // אגרגציה לפי חברה בתוך המוצר
    groups[groupName].total += amount;
    groups[groupName].products[productName].total += amount;
    groups[groupName].products[productName].companies[company] = 
      (groups[groupName].products[productName].companies[company] || 0) + amount;
  });

  return Object.entries(groups)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.total - a.total);
}, [yearlyPolicies, templatesById, productToGroupMap, productGroupMap]);


const exportYearlyAnalysisToExcel = (data: any[]) => {
  const excelRows: any[] = [];

  data.forEach(group => {
    Object.entries(group.products).forEach(([prodName, prodData]: [string, any]) => {
      Object.entries(prodData.companies).forEach(([compName, compTotal]: [string, any]) => {
        excelRows.push({
          'קבוצת מוצר': group.name,
          'מוצר': prodName,
          'חברה': compName,
          'סכום עמלה': compTotal,
          'נתח מהמוצר': `${((compTotal / prodData.total) * 100).toFixed(1)}%`,
          'נתח מכלל הקבוצה': `${((compTotal / group.total) * 100).toFixed(1)}%`
        });
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(excelRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ניתוח שנתי');
  XLSX.writeFile(wb, `ניתוח_שנתי_${selectedYear}.xlsx`);
};


const [isMounted, setIsMounted] = useState(false);

useEffect(() => {
  setIsMounted(true);
}, []);

// 1. הגדירי פלטת צבעים מעל הקומפוננטה
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// 2. בתוך הקומפוננטה, הוסיפי State לשליטה בנראות הטבלה המלאה
const [showFullTable, setShowFullTable] = useState(false);


// טעינה דינמית של הגרף - זה ימנע את שגיאת ה-activeIndex בוודאות
const DynamicPieChart = dynamic(
  () => import('recharts').then((mod) => mod.PieChart),
  { ssr: false }
);
const DynamicPie = dynamic(
  () => import('recharts').then((mod) => mod.Pie),
  { ssr: false }
);
const DynamicCell = dynamic(
  () => import('recharts').then((mod) => mod.Cell),
  { ssr: false }
);
const DynamicResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false }
);
const DynamicTooltip = dynamic(
  () => import('recharts').then((mod) => mod.Tooltip),
  { ssr: false }
);


// רכיבי הגרפים בטעינה דינמית ללא SSR
const PieChart = dynamic(() => import('recharts').then(mod => mod.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then(mod => mod.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then(mod => mod.Cell), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false });
const LineChart = dynamic(() => import('recharts').then(mod => mod.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then(mod => mod.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(mod => mod.CartesianGrid), { ssr: false });
// שימוש ב-as any פותר את ההתנגשות של ה-Types ב-Dynamic Import
const Legend = dynamic(() => import('recharts').then(mod => mod.Legend as any), { ssr: false });


useEffect(() => { setIsMounted(true); }, []);



const chartData = useMemo(() => {
  return productSummary.map(item => ({
    name: item.name,
    total: item.total
  }));
}, [productSummary]);


  return (
    <div className="p-4 max-w-6xl mx-auto text-right" dir="rtl">
      <h2 className="text-xl font-bold mb-4">סיכום עמלות לפי חודש וחברה</h2>
      {/* 🔹 בלוק נפרד מתחת לסלקטים */}
<div className="mb-4 px-4 py-3 text-sm text-gray-600 border rounded bg-white">
  <button
    type="button"
    className="text-blue-600 underline hover:no-underline"
    onClick={() => setShowChecklist(v => !v)}
    disabled={!selectedAgentId}
  >
    בדיקת שלמות נתונים {showChecklist ? '▲' : '▼'}
  </button>

  <div className="text-xs text-gray-500 mt-1">
    הצגת מצב טעינות לפי חברה/תבנית לשנה שנבחרה
  </div>

  {showChecklist && selectedAgentId && selectedYear && (
    <div className="mt-3 bg-gray-50 border rounded p-3">
      <AgentImportChecklist agentId={selectedAgentId} year={selectedYear} />
    </div>
  )}
</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 items-end">
        <div className="md:col-span-2">
          <label className="block font-semibold mb-1">בחר סוכן:</label>
          <select
            value={selectedAgentId}
            onChange={handleAgentChange}
            className="select-input w-full"
          >
            {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold mb-1">בחר שנה:</label>
          <select
            className="select-input w-full"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value="">בחר שנה</option>
            {Array.from({ length: 10 }, (_, idx) => currentYear - idx).map(
              (year) => (
                <option key={year} value={year.toString()}>
                  {year}
                </option>
              )
            )}
          </select>
        </div>
        <button 
  onClick={() => setShowYearlyAnalysis(!showYearlyAnalysis)}
  className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg hover:bg-indigo-700 transition"
>
  {showYearlyAnalysis ? 'סגור ניתוח שנתי' : '📊 ניתוח תיק שנתי'}
</button>
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <>
{showYearlyAnalysis && yearlyInsights && (
  <div className="space-y-6 animate-in fade-in zoom-in duration-500 pb-10">
    
    {/* ריבועי KPI */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-5 rounded-2xl shadow-lg text-white">
        <div className="text-indigo-100 text-[10px] font-bold uppercase">סה"כ עמלות {selectedYear}</div>
        <div className="text-3xl font-black mt-1">{formatCurrency(yearlyInsights.totalYearly)} ₪</div>
      </div>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-emerald-500">
        <div className="text-slate-400 text-[10px] font-bold uppercase">חברה מובילה</div>
        <div className="text-xl font-black text-slate-800 mt-1">{yearlyInsights.topCompany?.name || '-'}</div>
      </div>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-amber-500">
        <div className="text-slate-400 text-[10px] font-bold uppercase">חודש שיא</div>
        <div className="text-xl font-black text-slate-800 mt-1">{yearlyInsights.bestMonth?.month || '-'}</div>
      </div>
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-indigo-400">
        <div className="text-slate-400 text-[10px] font-bold uppercase">קבוצות מוצר</div>
        <div className="text-xl font-black text-slate-800 mt-1">{productSummary.length}</div>
      </div>
    </div>

    {/* גרף ותקציר */}
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-5 h-[320px] flex flex-col items-center justify-center border-l border-slate-100">
          {isMounted && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5}
                  label={({ name, percent = 0 }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {chartData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(val: any) => [`${formatCurrency(val)} ₪`, 'עמלה']} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="animate-pulse text-slate-300 italic">טוען ניתוח ויזואלי...</div>}
        </div>

        <div className="lg:col-span-7 space-y-6">
          <h3 className="text-2xl font-black text-slate-800">פילוח רווחיות מוצרים</h3>
          <div className="grid grid-cols-1 gap-3">
            {productSummary.slice(0, 3).map((item, idx) => (
              <div key={item.name} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="font-bold text-slate-700">{item.name}</span>
                </div>
                <div className="font-black text-indigo-600">{formatCurrency(item.total)} ₪</div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowFullTable(!showFullTable)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition-all">
            {showFullTable ? '⬆️ הסתר פירוט' : '⬇️ צפייה בפירוט חברות מלא'}
          </button>
        </div>
      </div>

      {/* הטבלה המפורטת עם ה-Stacked Bars */}
      {showFullTable && (
        <div className="border-t border-slate-100 animate-in slide-in-from-top-5 duration-500">
          <table className="w-full text-right border-collapse text-sm">
            <thead className="bg-slate-50 text-slate-400 font-bold border-b text-[11px] tracking-widest uppercase">
              <tr><th className="px-8 py-4">מוצר</th><th className="px-8 py-4 text-center">עמלה</th><th className="px-8 py-4 text-center">פילוח חברות</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productSummary.map(group => (
                <React.Fragment key={group.name}>
                  <tr className="bg-indigo-50/20"><td colSpan={2} className="px-8 py-4 font-black text-slate-800">{group.name}</td><td /></tr>
                  {Object.entries(group.products).map(([prodName, prodData]: any) => (
                    <tr key={prodName} className="hover:bg-slate-50">
                      <td className="pr-16 py-4 text-slate-600 italic">📦 {prodName}</td>
                      <td className="px-8 py-4 text-center font-bold">{formatCurrency(prodData.total)} ₪</td>
                      <td className="px-8 py-4 w-[40%]">
                        <div className="flex w-full h-3 rounded-full overflow-hidden bg-slate-100 border shadow-inner">
                          {Object.entries(prodData.companies).map(([cName, cTotal]: any, i) => (
                            <div key={cName} style={{ width: `${(cTotal/prodData.total)*100}%`, backgroundColor: COLORS[i % COLORS.length] }} title={`${cName}: ${formatCurrency(cTotal)}`} />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {Object.entries(prodData.companies).slice(0, 5).map(([cName, cTotal]: any, i) => (
                            <span key={cName} className="text-[9px] text-slate-500 flex items-center gap-1">
                              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                              {cName} ({((cTotal/prodData.total)*100).toFixed(0)}%)
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div>
)}
<table className="table-auto w-full border text-sm text-right mt-6">
          <thead className="bg-gray-100">
            <tr>
            <th className="border px-3 py-1 min-w-[90px] whitespace-nowrap">
      חודש
    </th>
              {allCompanies.map((company) => {
                const isOpen = expanded?.company === company;
                return (
                  <th key={company} className="border px-2 py-1">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-2 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded px-1 py-0.5"
                      onClick={() => handleToggleExpandCompany(company)}
                      title="לחצי כדי להציג פירוט לפי מספרי סוכן לחברה זו"
                      aria-expanded={isOpen}
                    >
                      <span>{company}</span>
                      <ChevronRight
                        className={`h-4 w-4 transition-transform ${
                          isOpen ? 'rotate-90' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  </th>
                );
              })}
              <th className="border px-2 py-1 font-bold bg-gray-50">
                סה&quot;כ לחודש
              </th>
            </tr>
          </thead>
          <tbody>
            {allMonths.map((month) => {
              const monthTotal = allCompanies.reduce(
                (sum, company) =>
                  sum + (summaryByMonthCompany[month]?.[company] || 0),
                0
              );
              return (
                <tr key={month}>
<td className="border px-3 py-1 font-semibold min-w-[90px] whitespace-nowrap">
          {month}
        </td>    
         {allCompanies.map((company) => (
                    <td
                      key={company}
                      className="border px-2 py-1 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleToggleExpand(month, company)}
                    >
                      {summaryByMonthCompany[month]?.[company]?.toLocaleString() ??
                        '-'}
                    </td>
                  ))}
                  <td className="border px-2 py-1 font-bold bg-gray-100">
                    {monthTotal.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </>
      )}
      {selectedCompany && (
        <div className="mt-10">
          <h3 className="text-xl font-semibold mb-2">
            פירוט עבור חברה: {selectedCompany}
          </h3>
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              className="p-2 rounded border hover:bg-gray-100"
              title="גלול ימינה"
              onClick={() =>
                drillScrollerRef.current?.scrollBy({
                  left: -400,
                  behavior: 'smooth',
                })
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded border hover:bg-gray-100"
              title="גלול שמאלה"
              onClick={() =>
                drillScrollerRef.current?.scrollBy({
                  left: 400,
                  behavior: 'smooth',
                })
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-gray-500 mr-auto">
              אפשר לגרור עם העכבר או להשתמש בחיצים לגלילה אופקית
            </span>
          </div>
          <div
            ref={drillScrollerRef}
            className="overflow-x-auto border rounded"
          >
            <table className="table-auto min-w-max w-full text-sm text-right whitespace-nowrap">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1 sticky right-0 z-10 bg-gray-100">
                    חודש
                  </th>
                  {Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {})
                    .sort()
                    .map((agentCode) => (
                      <th key={agentCode} className="border px-2 py-1">
                        {agentCode}
                      </th>
                    ))}
                  <th className="border px-2 py-1 font-bold bg-gray-50">
                    סה&quot;כ לחודש
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  new Set(
                    Object.values(
                      summaryByCompanyAgentMonth[selectedCompany] || {}
                    ).flatMap((m) => Object.keys(m))
                  )
                )
                  .sort()
                  .map((month) => {
                    const rowTotal = Object.keys(
                      summaryByCompanyAgentMonth[selectedCompany] || {}
                    ).reduce(
                      (sum, agentCode) =>
                        sum +
                        (summaryByCompanyAgentMonth[selectedCompany]?.[
                          agentCode
                        ]?.[month] || 0),
                      0
                    );
                    return (
                      <tr key={month}>
                        <td className="border px-2 py-1 font-semibold sticky right-0 z-10 bg-white">
                          {month}
                        </td>
                        {Object.keys(
                          summaryByCompanyAgentMonth[selectedCompany] || {}
                        )
                          .sort()
                          .map((agentCode) => (
                            <td
                            key={agentCode}
                            className="border px-2 py-1 cursor-pointer hover:bg-gray-100"
                            onClick={() => {
                              const companyId = companyIdByName[selectedCompany];
                              if (!companyId) return; 
                              openDrill(companyId, agentCode, month);
                            }}
         title="לחץ לפירוט פוליסות"
                          >
                            {summaryByCompanyAgentMonth[selectedCompany]?.[agentCode]?.[month]?.toLocaleString() ?? '-'}
                          </td>                          
                          ))}
                        <td className="border px-2 py-1 font-bold bg-gray-100">
                          {rowTotal.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!loading && allMonths.length > 0 && (
        <div className="mt-10 space-y-10">
          <section>
            <h3 className="text-xl font-semibold mb-3">
              גרף נפרעים לפי חודש (סה&quot;כ חודשי)
            </h3>
            <div className="w-full h-80 rounded-xl border bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={monthlyTotalsData}
                  margin={{ top: 10, right: 64, left: 10, bottom: 28 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    interval={0}
                    angle={0}
                    height={50}
                    tickMargin={10}
                    padding={{ left: 10, right: 28 }}
                  />
                  <YAxis tickFormatter={formatCurrency} width={80} />
                  <Tooltip
                    formatter={(value) => [
                      formatCurrency(value as number),
                      'סה"כ',
                    ]}
                    labelFormatter={(label) => `חודש: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke={palette[0]}
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    name='סה"כ'
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
      <section>
  <h3 className="text-xl font-semibold mb-3 text-slate-800">
    גרף נפרעים לפי חברה (התפתחות חודשית)
  </h3>
  {/* ה-div הזה פותר את הכל בעזרת dir="rtl" */}
  <div className="w-full h-96 rounded-2xl border bg-white shadow-sm p-4" dir="rtl">
    {isMounted && (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={perCompanyOverMonthsData}
          margin={{ top: 10, right: 10, left: 10, bottom: 28 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis 
            tickFormatter={formatCurrency} 
            width={80}
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <Tooltip
            formatter={(value: any, key: any) => [formatCurrency(value), key]}
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
          />
          {/* הורדנו את ה-wrapperStyle מכאן כי ה-dir="rtl" למעלה כבר מטפל בזה */}
<Legend {...({ 
  iconType: "circle", 
  verticalAlign: "top", 
  height: 36 
} as any)} />          
          {allCompanies.map((company, idx) => (
            <Line
              key={company}
              type="monotone"
              dataKey={company}
              stroke={COLORS[idx % COLORS.length]}
              strokeWidth={3}
              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
              activeDot={{ r: 6 }}
              name={company}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )}
  </div>
</section>
        </div>
      )}
      {drill && (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" dir="rtl">
    <div className="bg-white w-[min(1100px,95vw)] max-h-[85vh] overflow-auto rounded-xl p-4">
    <div className="flex items-center justify-between mb-3">
  <div className="font-bold">
    פירוט פוליסות | חודש {drill.month} | מספר סוכן {drill.agentCode}
  </div>

  <div className="flex items-center gap-2">
    {/* ייצוא לאקסל */}
    <button
      type="button"
      onClick={exportDrillToExcel}
      title="ייצוא לאקסל"
      className={`p-1 rounded hover:bg-gray-100 ${
        drillRows.length ? '' : 'opacity-50 cursor-not-allowed'
      }`}
      disabled={!drillRows.length}
    >
      <img
        src="/static/img/excel-icon.svg"
        alt="ייצוא לאקסל"
        width={24}
        height={24}
      />
    </button>

    {/* סגירה */}
    <button
      className="px-3 py-1 border rounded"
      onClick={() => setDrill(null)}
    >
      סגור
    </button>
  </div>
</div>
      {drillLoading ? (
        <Spinner />
      ) : (
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1">פוליסה</th>
              <th className="border px-2 py-1">ת״ז</th>
              <th className="border px-2 py-1">לקוח</th>
              <th className="border px-2 py-1">מוצר</th>
              <th className="border px-2 py-1">פרמיה</th>
              <th className="border px-2 py-1">עמלה</th>
              <th className="border px-2 py-1">% עמלה</th>
            </tr>
          </thead>
          <tbody>
            {drillRows.map((r) => (
              <tr key={`${r.policyNumberKey}_${r.customerId}`}>
                <td className="border px-2 py-1">{r.policyNumberKey}</td>
                <td className="border px-2 py-1">{r.customerId ?? '-'}</td>
                <td className="border px-2 py-1">{r.fullName ?? '-'}</td>
                <td className="border px-2 py-1">{r.product ?? '-'}</td>
                <td className="border px-2 py-1">{Number(r.totalPremiumAmount ?? 0).toLocaleString()}</td>
                <td className="border px-2 py-1 font-semibold">{Number(r.totalCommissionAmount ?? 0).toLocaleString()}</td>
                <td className="border px-2 py-1">{Number(r.commissionRate ?? 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </div>
)}
    </div>
  );
};
export default CommissionSummaryAgentTab;