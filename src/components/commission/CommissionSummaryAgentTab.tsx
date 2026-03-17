'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { Spinner } from '@/components/Spinner';
import AgentImportChecklist from '@/components/commission/AgentImportChecklist';
import dynamic from 'next/dynamic';
import * as XLSX from 'xlsx';
import { resolveFromTemplate } from '@/utils/contractCommissionResolvers';
// אם תרצי להשתמש במנוע המלא:
import useFetchMD from '@/hooks/useMD';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { ChevronLeft, ChevronRight, PieChart as PieIcon } from 'lucide-react';



// 1. ייבוא של כל הספרייה תחת משתנה אחד עם השתקת שגיאות גורפת
const DynamicResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false }) as React.ComponentType<any>;
const DynamicPieChart = dynamic(() => import('recharts').then(m => m.PieChart), { ssr: false }) as React.ComponentType<any>;
const DynamicPie = dynamic(() => import('recharts').then(m => m.Pie), { ssr: false }) as React.ComponentType<any>;
const DynamicCell = dynamic(() => import('recharts').then(m => m.Cell), { ssr: false }) as React.ComponentType<any>;
const DynamicTooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false }) as React.ComponentType<any>;
const DynamicLineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false }) as React.ComponentType<any>;
const DynamicLine = dynamic(() => import('recharts').then(m => m.Line), { ssr: false }) as React.ComponentType<any>;
const DynamicXAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false }) as React.ComponentType<any>;
const DynamicYAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false }) as React.ComponentType<any>;
const DynamicCartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false }) as React.ComponentType<any>;
const DynamicLegend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false }) as React.ComponentType<any>;

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
  reportMonth: string;
  runId?: string;
  templateId: string;    
  productGroup?: string; 
  companyName?: string;
};

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];



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

  const rowsForExcel = drillRows.map((r) => {
    // פתרון המוצר לפני הייצוא
    const template = templatesById[r.templateId];
    const resolved = resolveFromTemplate(template, r.product);
    
    return {
      'פוליסה': r.policyNumberKey,
      'ת״ז': r.customerId ?? '', 
      'לקוח': r.fullName ?? '',
      'מוצר': resolved.canonicalProduct || 'אחר', // שימוש במוצר המחושב
      'פרמיה': r.totalPremiumAmount,
      'עמלה': r.totalCommissionAmount,
      '% עמלה': r.commissionRate,
    };
  });

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
    
    // כאן הקסם קורה: אם row.product ריק, resolveFromTemplate יחזיר את ה-fallbackProduct מהתבנית
    const resolved = resolveFromTemplate(template, row.product);
    const productName = resolved.canonicalProduct || 'אחר';
    
    // מציאת הקבוצה לפי המוצר המחושב (הקנוני)
    const groupId = productToGroupMap[productName] || row.productGroup || '';
    const groupName = productGroupMap[groupId] || (groupId ? `קבוצה ${groupId}` : 'ללא סיווג');
    
    const amount = row.totalCommissionAmount || 0;
    const company = row.companyName || 'חברה לא ידועה';

    if (!groups[groupName]) {
      groups[groupName] = { total: 0, products: {} };
    }
    
    if (!groups[groupName].products[productName]) {
      groups[groupName].products[productName] = { total: 0, companies: {} };
    }

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

// 2. בתוך הקומפוננטה, הוסיפי State לשליטה בנראות הטבלה המלאה
const [showFullTable, setShowFullTable] = useState(false);



const chartData = useMemo(() => {
  return productSummary.map((item, index) => ({
    name: item.name,
    total: item.total,
    fill: COLORS[index % COLORS.length] // הזרקת הצבע ישירות לנתון
  }));
}, [productSummary]);



const exportProductAnalysisToExcel = () => {
  if (!productSummary.length) return;

  const excelRows: any[] = [];

  productSummary.forEach(group => {
    Object.entries(group.products).forEach(([prodName, prodData]: [string, any]) => {
      Object.entries(prodData.companies).forEach(([compName, compTotal]: [string, any]) => {
        excelRows.push({
          'קבוצת מוצר': group.name,
          'מוצר': prodName,
          'חברה': compName,
          'סכום עמלה': compTotal,
          'שנה': selectedYear,
          'נתח מהמוצר': `${((compTotal / prodData.total) * 100).toFixed(1)}%`,
          'נתח מכלל הקבוצה': `${((compTotal / group.total) * 100).toFixed(1)}%`
        });
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(excelRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ניתוח שנתי מפורט');

  // שמירת הקובץ
  XLSX.writeFile(wb, `ניתוח_עמלות_שנתי_${selectedYear}.xlsx`);
};




const groupMonthlyData = useMemo(() => {
  if (!expandedGroup || !yearlyPolicies.length) return [];
  
  // יצירת מערך של 12 חודשים ריקים
  const months = allMonths.sort(); 
  const dataMap: Record<string, number> = {};
  months.forEach(m => dataMap[m] = 0);

  yearlyPolicies.forEach(row => {
    const template = templatesById[row.templateId];
    const resolved = resolveFromTemplate(template, row.product);
    const productName = resolved.canonicalProduct || 'אחר';
    const groupId = productToGroupMap[productName] || row.productGroup || '';
    const groupName = productGroupMap[groupId] || 'ללא סיווג';

    if (groupName === expandedGroup) {
      const m = row.reportMonth; // ודאי שהשדה הזה מגיע ב-DrillRow
      if (dataMap[m] !== undefined) {
        dataMap[m] += row.totalCommissionAmount;
      }
    }
  });

  return Object.entries(dataMap).map(([month, total]) => ({ month, total }));
}, [expandedGroup, yearlyPolicies, allMonths, templatesById, productToGroupMap, productGroupMap]);




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
 {/* 1. כרטיסיות ה-KPI (הריבועים) */}
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  {/* סה"כ עמלות */}
 {/* סה"כ עמלות - גרסה עדינה ונקייה */}
<div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-indigo-500">
<div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
  סה&quot;כ עמלות {selectedYear}
</div>
  <div className="text-3xl font-black mt-1 text-indigo-600">
    {formatCurrency(yearlyInsights.totalYearly)} ₪
  </div>
  <div className="flex items-center gap-1.5 mt-2">
    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
    <div className="text-[10px] text-slate-400 font-medium italic">
      ממוצע חודשי: {formatCurrency(yearlyInsights.totalYearly / 12)} ₪
    </div>
  </div>
</div>

  {/* חברה מובילה */}
  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-emerald-500">
    <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">חברה מובילה</div>
    <div className="text-xl font-black text-slate-800 mt-1">{yearlyInsights.topCompany?.name || '-'}</div>
    <div className="text-xs text-emerald-600 font-bold">{formatCurrency(yearlyInsights.topCompany?.total || 0)} ₪</div>
  </div>

  {/* חודש שיא */}
  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-amber-500">
    <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">חודש שיא</div>
    <div className="text-xl font-black text-slate-800 mt-1">{yearlyInsights.bestMonth?.month || '-'}</div>
    <div className="text-xs text-amber-600 font-bold">{formatCurrency(yearlyInsights.bestMonth?.total || 0)} ₪</div>
  </div>

  {/* קבוצה דומיננטית - התיקון החדש שלך */}
  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-indigo-400">
    <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">קבוצה דומיננטית</div>
    <div className="text-xl font-black text-slate-800 mt-1 truncate" title={productSummary[0]?.name}>
      {productSummary[0]?.name || 'אין נתונים'}
    </div>
    <div className="text-[10px] text-slate-400 mt-1 italic">
      מתוך {productSummary.length} קבוצות מוצר
    </div>
  </div>
</div>
    {/* גרף ותקציר */}
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
<div className="lg:col-span-5 h-[350px] flex flex-col items-center justify-center border-l border-slate-100 pr-4 relative">
  <h4 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest text-center w-full">
    התפלגות תיק שנתי
  </h4>
  
  {isMounted && chartData.length > 0 ? (
    <DynamicResponsiveContainer width="100%" height="100%">
      {/* 1. Margin גדול מאוד בצדדים כדי לתת מקום לטקסט לצאת החוצה */}
      <DynamicPieChart margin={{ top: 30, right: 70, bottom: 30, left: 70 }}>
 <DynamicPie
  data={chartData}
  dataKey="total"
  nameKey="name"
  cx="50%"
  cy="50%"
  innerRadius={0}
  outerRadius={65} // הקטנו ל-65 כדי לפנות מקום לטקסט
  paddingAngle={5}
  minAngle={15}
  animationDuration={800}
  labelLine={true}
  label={({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
    name
  }: any) => {
    // חישוב המיקום מחוץ לעיגול
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 25; // המרחק של הטקסט מהעיגול
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="#4b5563" // אפור כהה קריא
        textAnchor={x > cx ? 'start' : 'end'} // יישור לפי צד ימין או שמאל
        dominantBaseline="central"
        style={{ fontSize: '12px', fontWeight: 'bold' }}
      >
        {`${name} ${(percent * 100).toFixed(0)}%`}
      </text>
    );
  }}
>
  {chartData.map((entry: any, index: number) => (
    <DynamicCell 
      key={`cell-${index}`} 
      fill={entry.fill} 
      stroke="#fff" 
      strokeWidth={2}
    />
  ))}
</DynamicPie>
        <DynamicTooltip formatter={(val: any) => [`${formatCurrency(val)} ₪`, 'עמלה שנתי']} />
      </DynamicPieChart>
    </DynamicResponsiveContainer>
  ) : (
    <div className="h-48 flex items-center justify-center italic text-slate-400 animate-pulse">
      מעבד נתונים...
    </div>
  )}
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
            {showFullTable ? '⬆️ הסתר פירוט' : '⬇️ צפייה בפירוט מלא'}
          </button>
        </div>
      </div>
      {/* הטבלה המפורטת עם ה-Stacked Bars */}
{/* הטבלה המפורטת עם ה-Stacked Bars */}
{showFullTable && (
  <div className="border-t border-slate-100 animate-in slide-in-from-top-5 duration-500">
    <table className="w-full text-right border-collapse text-sm">
      <thead className="bg-slate-50 text-slate-500 font-bold border-b text-[14px] tracking-wide uppercase">
        <tr>
          <th className="px-8 py-4 text-right">מוצר</th>
          <th className="px-8 py-4 text-center">עמלה</th>
          <th className="px-8 py-4 text-left">
            <div className="flex items-center justify-between">
              <span>פילוח חברות</span>
              
              {/* כפתור אקסל בקצה השמאלי של הכותרת */}
              <button 
                onClick={exportProductAnalysisToExcel}
                className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors text-[12px]"
                title="ייצוא ניתוח שנתי לאקסל"
              >
                <img src="/static/img/excel-icon.svg" width={16} height={16} alt="Excel" />
                <span>ייצוא נתונים</span>
              </button>
            </div>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {productSummary.map(group => (
          <React.Fragment key={group.name}>
          <tr 
  className="bg-indigo-50/20 cursor-pointer hover:bg-indigo-100 transition-colors" 
  onClick={() => setExpandedGroup(expandedGroup === group.name ? null : group.name)}
>
  <td colSpan={2} className="px-8 py-4 font-black text-slate-800 text-right text-base">
    {group.name} {expandedGroup === group.name ? '▲' : '▼'}
  </td>
  <td />
</tr>
            {Object.entries(group.products).map(([prodName, prodData]: any) => (
              <tr key={prodName} className="hover:bg-slate-50">
                {/* 1. יישור לימין של מוצרי המשנה */}
                <td className="pr-16 py-4 text-slate-600 italic text-right text-[14px]">
                  📦 {prodName}
                </td>
                <td className="px-8 py-4 text-center font-bold text-base">
                  {formatCurrency(prodData.total)} ₪
                </td>
                <td className="px-8 py-4 w-[45%]">
                  <div className="flex w-full h-3 rounded-full overflow-hidden bg-slate-100 border shadow-inner">
                    {Object.entries(prodData.companies).map(([cName, cTotal]: any, i) => (
                      <div 
                        key={cName} 
                        style={{ width: `${(cTotal/prodData.total)*100}%`, backgroundColor: COLORS[i % COLORS.length] }} 
                        title={`${cName}: ${formatCurrency(cTotal)}`} 
                      />
                    ))}
                  </div>
                  {/* 3. הגדלת שמות החברות בפילוח */}
                  <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 justify-start">
                    {Object.entries(prodData.companies).map(([cName, cTotal]: any, i) => (
                      <span key={cName} className="text-[12px] text-slate-700 font-semibold flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        {cName} ({((cTotal/prodData.total)*100).toFixed(0)}%)
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {/* בתוך ה-map של productSummary, מתחת לשורה של ה-productGroup */}
{expandedGroup === group.name && (
  <tr className="bg-slate-50/50">
    <td colSpan={3} className="px-8 py-10">
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-sm font-black text-slate-700 flex items-center gap-2">
            <span>📈</span> מגמת מוצרים בתוך: {group.name}
          </h4>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            עמלה חודשית (₪)
          </span>
        </div>
        
        <div className="h-80 w-full">
          <DynamicResponsiveContainer width="100%" height="100%">
            <DynamicLineChart 
              data={(allMonths.length > 0 ? allMonths : ['01','02','03','04','05','06','07','08','09','10','11','12']).map(m => {
                const fullMonth = m.includes('-') ? m : `${selectedYear}-${m}`;
                const dataPoint: any = { month: m };
                
                // חישוב עמלה לכל מוצר בנפרד עבור החודש הנוכחי
                Object.keys(group.products).forEach(prodName => {
                  dataPoint[prodName] = yearlyPolicies
                    .filter(row => {
                      const template = templatesById[row.templateId];
                      const resolved = resolveFromTemplate(template, row.product);
                      const currentProdName = resolved.canonicalProduct || 'אחר';
                      return currentProdName === prodName && row.reportMonth === fullMonth;
                    })
                    .reduce((sum, r) => sum + r.totalCommissionAmount, 0);
                });
                
                return dataPoint;
              })}
            >
              <DynamicCartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <DynamicXAxis dataKey="month" tick={{fontSize: 10, fill: '#94a3b8'}} />
              <DynamicYAxis tickFormatter={formatCurrency} width={60} tick={{fontSize: 10, fill: '#94a3b8'}} />
              <DynamicTooltip 
                contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                formatter={(v: any) => [`${formatCurrency(v)} ₪`]}
              />
              <DynamicLegend verticalAlign="top" height={36} iconType="circle" />
              
              {/* יצירת קו נפרד לכל מוצר באופן דינמי */}
              {Object.keys(group.products).map((prodName, idx) => (
                <DynamicLine 
                  key={prodName}
                  type="monotone" 
                  dataKey={prodName} 
                  name={prodName}
                  stroke={COLORS[idx % COLORS.length]} 
                  strokeWidth={3} 
                  dot={{r: 3}}
                  activeDot={{r: 5}}
                  connectNulls
                />
              ))}
            </DynamicLineChart>
          </DynamicResponsiveContainer>
        </div>
      </div>
    </td>
  </tr>
)}
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
    {isMounted && (
      <DynamicResponsiveContainer width="100%" height="100%">
        <DynamicLineChart
          data={monthlyTotalsData}
          margin={{ top: 10, right: 64, left: 10, bottom: 28 }}
        >
          <DynamicCartesianGrid strokeDasharray="3 3" />
          <DynamicXAxis
            dataKey="month"
            interval={0}
            height={50}
            tickMargin={10}
            padding={{ left: 10, right: 28 }}
          />
          <DynamicYAxis tickFormatter={formatCurrency} width={80} />
        <DynamicTooltip
  formatter={(value: any) => [
    formatCurrency(value),
    'סה"כ',
  ]}
  labelFormatter={(label: any) => `חודש: ${label}`}
/>
          <DynamicLine
            type="monotone"
            dataKey="total"
            stroke={palette[0]}
            strokeWidth={3}
            dot={{ r: 3 }}
            name='סה"כ'
          />
        </DynamicLineChart>
      </DynamicResponsiveContainer>
    )}
  </div>
</section>
   <section>
  <h3 className="text-xl font-semibold mb-3 text-slate-800">
    גרף נפרעים לפי חברה (התפתחות חודשית)
  </h3>
  <div className="w-full h-96 rounded-2xl border bg-white shadow-sm p-4" dir="rtl">
    {isMounted && (
      <DynamicResponsiveContainer width="100%" height="100%">
        <DynamicLineChart
          data={perCompanyOverMonthsData}
          margin={{ top: 10, right: 10, left: 10, bottom: 28 }}
        >
          <DynamicCartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <DynamicXAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <DynamicYAxis 
            tickFormatter={formatCurrency} 
            width={80}
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <DynamicTooltip
            formatter={(value: any, key: any) => [formatCurrency(value), key]}
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
          />
          <DynamicLegend {...({ 
            iconType: "circle", 
            verticalAlign: "top", 
            height: 36 
          } as any)} />          
          {allCompanies.map((company, idx) => (
            <DynamicLine
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
        </DynamicLineChart>
      </DynamicResponsiveContainer>
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
{drillRows.map((r) => {
  // 1. שליפת התבנית המתאימה לרשומה
  const template = templatesById[r.templateId];
  // 2. פתרון המוצר (כולל ה-Fallback אם ה-Product המקורי ריק)
  const resolved = resolveFromTemplate(template, r.product);
  const displayProduct = resolved.canonicalProduct || 'אחר';

  return (
    <tr key={`${r.policyNumberKey}_${r.customerId}`}>
      <td className="border px-2 py-1">{r.policyNumberKey}</td>
      <td className="border px-2 py-1">{r.customerId ?? '-'}</td>
      <td className="border px-2 py-1">{r.fullName ?? '-'}</td>
      {/* הצגת המוצר המחושב */}
      <td className="border px-2 py-1">{displayProduct}</td>
      <td className="border px-2 py-1">{Number(r.totalPremiumAmount ?? 0).toLocaleString()}</td>
      <td className="border px-2 py-1 font-semibold">{Number(r.totalCommissionAmount ?? 0).toLocaleString()}</td>
      <td className="border px-2 py-1">{Number(r.commissionRate ?? 0).toLocaleString()}</td>
    </tr>
  );
})}
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