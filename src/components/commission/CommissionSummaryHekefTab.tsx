'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { Spinner } from '@/components/Spinner';
import dynamic from 'next/dynamic';
import * as XLSX from 'xlsx';
import { resolveFromTemplate } from '@/utils/contractCommissionResolvers';
import useFetchMD from '@/hooks/useMD';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DynamicResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false }) as React.ComponentType<any>;
const DynamicPieChart = dynamic(() => import('recharts').then(m => m.PieChart), { ssr: false }) as React.ComponentType<any>;
const DynamicPie = dynamic(() => import('recharts').then(m => m.Pie), { ssr: false }) as React.ComponentType<any>;
const DynamicCell = dynamic(() => import('recharts').then(m => m.Cell), { ssr: false }) as React.ComponentType<any>;
const DynamicLineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false }) as React.ComponentType<any>;
const DynamicLine = dynamic(() => import('recharts').then(m => m.Line), { ssr: false }) as React.ComponentType<any>;
const DynamicXAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false }) as React.ComponentType<any>;
const DynamicYAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false }) as React.ComponentType<any>;
const DynamicCartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false }) as React.ComponentType<any>;
const DynamicTooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false }) as React.ComponentType<any>;
const DynamicLegend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false }) as React.ComponentType<any>;

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface HekefSummaryResponse {
  summaryByMonthCompany: Record<string, Record<string, number>>;
  summaryByCompanyAgentMonth: Record<string, Record<string, Record<string, number>>>;
  companyIdByName: Record<string, string>;
  allMonths: string[];
  allCompanies: string[];
  monthlyTotalsData: { month: string; total: number }[];
  perCompanyOverMonthsData: Record<string, string | number>[];
}

type DrillRow = {
  policyNumberKey: string;
  customerId: string;
  fullName?: string;
  product?: string;
  templateId: string;
  totalPremiumAmount: number;
  validMonth?: string;
  reportMonth: string;
  companyName?: string;
};

type DrillKey = { companyId: string; agentCode: string; month: string } | null;

const CommissionSummaryHekefTab: React.FC = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [summaryByMonthCompany, setSummaryByMonthCompany] = useState<Record<string, Record<string, number>>>({});
  const [summaryByCompanyAgentMonth, setSummaryByCompanyAgentMonth] = useState<Record<string, Record<string, Record<string, number>>>>({});
  const [companyIdByName, setCompanyIdByName] = useState<Record<string, string>>({});
  const [allMonths, setAllMonths] = useState<string[]>([]);
  const [allCompanies, setAllCompanies] = useState<string[]>([]);
  const [monthlyTotalsData, setMonthlyTotalsData] = useState<{ month: string; total: number }[]>([]);
  const [perCompanyOverMonthsData, setPerCompanyOverMonthsData] = useState<Record<string, string | number>[]>([]);

  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<{ month: string; company: string } | null>(null);
  const drillScrollerRef = useRef<HTMLDivElement>(null);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());

  const [drill, setDrill] = useState<DrillKey>(null);
  const [drillRows, setDrillRows] = useState<DrillRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const [templatesById, setTemplatesById] = useState<Record<string, any>>({});
  useEffect(() => {
    const fetchTemplates = async () => {
      const snap = await getDocs(collection(db, 'commissionTemplates'));
      const map: Record<string, any> = {};
      snap.forEach(doc => { map[doc.id] = doc.data(); });
      setTemplatesById(map);
    };
    fetchTemplates();
  }, []);

  const { productGroupMap, productToGroupMap } = useFetchMD();

  const [showYearlyAnalysis, setShowYearlyAnalysis] = useState(false);
  const [yearlyPolicies, setYearlyPolicies] = useState<DrillRow[]>([]);
  const [isYearlyLoading, setIsYearlyLoading] = useState(false);
  const [showFullTable, setShowFullTable] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!selectedAgentId || !selectedYear) {
        setSummaryByMonthCompany({});
        setSummaryByCompanyAgentMonth({});
        setCompanyIdByName({});
        setAllMonths([]);
        setAllCompanies([]);
        setMonthlyTotalsData([]);
        setPerCompanyOverMonthsData([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/hekef-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: selectedAgentId, year: selectedYear }),
        });
        if (!res.ok) return;
        const data: HekefSummaryResponse = await res.json();
        setSummaryByMonthCompany(data.summaryByMonthCompany ?? {});
        setSummaryByCompanyAgentMonth(data.summaryByCompanyAgentMonth ?? {});
        setCompanyIdByName(data.companyIdByName ?? {});
        setAllMonths(data.allMonths ?? []);
        setAllCompanies(data.allCompanies ?? []);
        setMonthlyTotalsData(data.monthlyTotalsData ?? []);
        setPerCompanyOverMonthsData(data.perCompanyOverMonthsData ?? []);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedAgentId, selectedYear]);

  useEffect(() => {
    const fetchYearlyData = async () => {
      if (!selectedAgentId || !selectedYear || !showYearlyAnalysis) return;
      setIsYearlyLoading(true);
      setYearlyPolicies([]);
      try {
        const res = await fetch('/api/hekef-summary-yearly-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: selectedAgentId, year: selectedYear }),
        });
        const data = await res.json();
        setYearlyPolicies(data.rows || []);
      } finally {
        setIsYearlyLoading(false);
      }
    };
    fetchYearlyData();
  }, [showYearlyAnalysis, selectedYear, selectedAgentId]);

  const formatCurrency = (v: number | string) =>
    Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 });

  const handleToggleExpandCompany = (company: string) => {
    setExpanded(prev => prev?.company === company ? null : { month: 'ALL', company });
  };

  const handleToggleExpand = (month: string, company: string) => {
    if (expanded?.month === month && expanded.company === company) {
      setExpanded(null);
    } else {
      setExpanded({ month, company });
    }
  };

  const selectedCompany = expanded?.company;

  async function openDrill(companyId: string, agentCode: string, month: string) {
    setDrill({ companyId, agentCode, month });
    setDrillLoading(true);
    setDrillRows([]);
    try {
      const res = await fetch('/api/hekef-summary-drilldown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, companyId, agentCode, reportMonth: month }),
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
    const rowsForExcel = drillRows.map(r => ({
      'פוליסה': r.policyNumberKey,
      'ת״ז': r.customerId ?? '',
      'לקוח': r.fullName ?? '',
      'מוצר': resolveFromTemplate(templatesById[r.templateId], r.product).canonicalProduct || r.product || '',
      'תפוקה': r.totalPremiumAmount,
      'חודש הצטרפות': r.validMonth ?? r.reportMonth,
    }));
    const ws = XLSX.utils.json_to_sheet(rowsForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'פירוט תפוקות');
    XLSX.writeFile(wb, `פירוט_היקפים_${drill.agentCode}_${drill.month}.xlsx`);
  };

  const yearlyInsights = useMemo(() => {
    if (!monthlyTotalsData.length) return null;
    const sorted = [...monthlyTotalsData].sort((a, b) => b.total - a.total);
    const totalYearly = sorted.reduce((sum, m) => sum + m.total, 0);
    const companyDistribution = allCompanies.map(name => ({
      name,
      total: allMonths.reduce((sum, month) => sum + (summaryByMonthCompany[month]?.[name] || 0), 0),
    })).sort((a, b) => b.total - a.total);
    return { totalYearly, topCompany: companyDistribution[0], bestMonth: sorted[0] };
  }, [monthlyTotalsData, allCompanies, allMonths, summaryByMonthCompany]);

  const productSummary = useMemo(() => {
    if (!yearlyPolicies.length || !productToGroupMap) return [];
    const groups: Record<string, any> = {};
    yearlyPolicies.forEach(row => {
      const template = templatesById[row.templateId];
      const resolved = resolveFromTemplate(template, row.product);
      const productName = resolved.canonicalProduct || 'אחר';
      const groupId = productToGroupMap[productName] || '';
      const groupName = productGroupMap[groupId] || (groupId ? `קבוצה ${groupId}` : 'ללא סיווג');
      const amount = row.totalPremiumAmount || 0;
      const company = row.companyName || 'חברה לא ידועה';
      if (!groups[groupName]) groups[groupName] = { total: 0, products: {} };
      if (!groups[groupName].products[productName]) groups[groupName].products[productName] = { total: 0, companies: {} };
      groups[groupName].total += amount;
      groups[groupName].products[productName].total += amount;
      groups[groupName].products[productName].companies[company] = (groups[groupName].products[productName].companies[company] || 0) + amount;
    });
    return Object.entries(groups).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
  }, [yearlyPolicies, templatesById, productToGroupMap, productGroupMap]);

  const chartData = useMemo(() => productSummary.map((item, index) => ({
    name: item.name, total: item.total, fill: COLORS[index % COLORS.length],
  })), [productSummary]);

  const exportProductAnalysisToExcel = () => {
    if (!productSummary.length) return;
    const excelRows: any[] = [];
    productSummary.forEach(group => {
      Object.entries(group.products).forEach(([prodName, prodData]: [string, any]) => {
        Object.entries(prodData.companies).forEach(([compName, compTotal]: [string, any]) => {
          excelRows.push({
            'קבוצת מוצר': group.name, 'מוצר': prodName, 'חברה': compName,
            'סה"כ תפוקה': compTotal, 'שנה': selectedYear,
            'נתח מהמוצר': `${((compTotal / prodData.total) * 100).toFixed(1)}%`,
            'נתח מכלל הקבוצה': `${((compTotal / group.total) * 100).toFixed(1)}%`,
          });
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ניתוח תפוקות שנתי');
    XLSX.writeFile(wb, `ניתוח_היקפים_שנתי_${selectedYear}.xlsx`);
  };

  const palette = ['#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#f59e0b', '#0891b2'];

  return (
    <div className="p-4 max-w-6xl mx-auto text-right" dir="rtl">
      <h2 className="text-xl font-bold mb-4">סיכום תפוקות לפי חודש וחברה</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 items-end">
        <div className="md:col-span-2">
          <label className="block font-semibold mb-1">בחר סוכן:</label>
          <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full">
            {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
            {agents.map(agent => (<option key={agent.id} value={agent.id}>{agent.name}</option>))}
          </select>
        </div>
        <div>
          <label className="block font-semibold mb-1">בחר שנה:</label>
          <select className="select-input w-full" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
            <option value="">בחר שנה</option>
            {Array.from({ length: 10 }, (_, idx) => currentYear - idx).map(year => (
              <option key={year} value={year.toString()}>{year}</option>
            ))}
          </select>
        </div>
        <button onClick={() => setShowYearlyAnalysis(!showYearlyAnalysis)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg hover:bg-indigo-700 transition">
          {showYearlyAnalysis ? 'סגור ניתוח שנתי' : '📊 ניתוח תיק תפוקות'}
        </button>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* ניתוח שנתי */}
          {showYearlyAnalysis && yearlyInsights && (
            <div className="space-y-6 animate-in fade-in zoom-in duration-500 pb-10">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-indigo-500">
                  <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">סה&quot;כ תפוקה {selectedYear}</div>
                  <div className="text-3xl font-black mt-1 text-indigo-600">{formatCurrency(yearlyInsights.totalYearly)} ₪</div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                    <div className="text-[10px] text-slate-400 font-medium italic">ממוצע חודשי: {formatCurrency(yearlyInsights.totalYearly / 12)} ₪</div>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-emerald-500">
                  <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">חברה מובילה</div>
                  <div className="text-xl font-black text-slate-800 mt-1">{yearlyInsights.topCompany?.name || '-'}</div>
                  <div className="text-xs text-emerald-600 font-bold">{formatCurrency(yearlyInsights.topCompany?.total || 0)} ₪</div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-amber-500">
                  <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">חודש שיא</div>
                  <div className="text-xl font-black text-slate-800 mt-1">{yearlyInsights.bestMonth?.month || '-'}</div>
                  <div className="text-xs text-amber-600 font-bold">{formatCurrency(yearlyInsights.bestMonth?.total || 0)} ₪</div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-indigo-400">
                  <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">קבוצה דומיננטית</div>
                  <div className="text-xl font-black text-slate-800 mt-1 truncate">{productSummary[0]?.name || 'אין נתונים'}</div>
                  <div className="text-[10px] text-slate-400 mt-1 italic">מתוך {productSummary.length} קבוצות מוצר</div>
                </div>
              </div>

              {isYearlyLoading ? <Spinner /> : (
                <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                  <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                    <div className="lg:col-span-5 h-[350px] flex flex-col items-center justify-center border-l border-slate-100 pr-4">
                      <h4 className="text-xs font-bold text-slate-400 mb-4 uppercase tracking-widest text-center w-full">התפלגות תיק תפוקות</h4>
                      {isMounted && chartData.length > 0 ? (
                        <DynamicResponsiveContainer width="100%" height="100%">
                          <DynamicPieChart margin={{ top: 30, right: 70, bottom: 30, left: 70 }}>
                            <DynamicPie data={chartData} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={0} outerRadius={65} paddingAngle={5} minAngle={15} animationDuration={800} labelLine={true}
                              label={({ cx, cy, midAngle, outerRadius, percent, name }: any) => {
                                const RADIAN = Math.PI / 180;
                                const radius = outerRadius + 25;
                                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                return <text x={x} y={y} fill="#4b5563" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" style={{ fontSize: '12px', fontWeight: 'bold' }}>{`${name} ${(percent * 100).toFixed(0)}%`}</text>;
                              }}
                            >
                              {chartData.map((entry: any, index: number) => (
                                <DynamicCell key={`cell-${index}`} fill={entry.fill} stroke="#fff" strokeWidth={2} />
                              ))}
                            </DynamicPie>
                            <DynamicTooltip formatter={(val: any) => [`${formatCurrency(val)} ₪`, 'תפוקה שנתית']} />
                          </DynamicPieChart>
                        </DynamicResponsiveContainer>
                      ) : (
                        <div className="h-48 flex items-center justify-center italic text-slate-400 animate-pulse">מעבד נתונים...</div>
                      )}
                    </div>

                    <div className="lg:col-span-7 space-y-6">
                      <h3 className="text-2xl font-black text-slate-800">פילוח תפוקה לפי מוצר</h3>
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

                  {showFullTable && (
                    <div className="border-t border-slate-100 animate-in slide-in-from-top-5 duration-500">
                      <table className="w-full text-right border-collapse text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b text-[14px] tracking-wide uppercase">
                          <tr>
                            <th className="px-8 py-4 text-right">מוצר</th>
                            <th className="px-8 py-4 text-center">תפוקה</th>
                            <th className="px-8 py-4 text-left">
                              <div className="flex items-center justify-between">
                                <span>פילוח חברות</span>
                                <button onClick={exportProductAnalysisToExcel} className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors text-[12px]">
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
                              <tr className="bg-indigo-50/20 cursor-pointer hover:bg-indigo-100 transition-colors" onClick={() => setExpandedGroup(expandedGroup === group.name ? null : group.name)}>
                                <td colSpan={2} className="px-8 py-4 font-black text-slate-800 text-right text-base">{group.name} {expandedGroup === group.name ? '▲' : '▼'}</td>
                                <td />
                              </tr>
                              {Object.entries(group.products).map(([prodName, prodData]: any) => (
                                <tr key={prodName} className="hover:bg-slate-50">
                                  <td className="pr-16 py-4 text-slate-600 italic text-right text-[14px]">📦 {prodName}</td>
                                  <td className="px-8 py-4 text-center font-bold text-base">{formatCurrency(prodData.total)} ₪</td>
                                  <td className="px-8 py-4 w-[45%]">
                                    <div className="flex w-full h-3 rounded-full overflow-hidden bg-slate-100 border shadow-inner">
                                      {Object.entries(prodData.companies).map(([cName, cTotal]: any, i) => (
                                        <div key={cName} style={{ width: `${(cTotal / prodData.total) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} title={`${cName}: ${formatCurrency(cTotal)}`} />
                                      ))}
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 justify-start">
                                      {Object.entries(prodData.companies).map(([cName, cTotal]: any, i) => (
                                        <span key={cName} className="text-[12px] text-slate-700 font-semibold flex items-center gap-1.5">
                                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                          {cName} ({((cTotal / prodData.total) * 100).toFixed(0)}%)
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {expandedGroup === group.name && (
                                <tr className="bg-slate-50/50">
                                  <td colSpan={3} className="px-8 py-10">
                                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                                      <div className="flex items-center justify-between mb-6">
                                        <h4 className="text-sm font-black text-slate-700 flex items-center gap-2"><span>📈</span> מגמת תפוקה בתוך: {group.name}</h4>
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">תפוקה חודשית (₪)</span>
                                      </div>
                                      <div className="h-80 w-full">
                                        <DynamicResponsiveContainer width="100%" height="100%">
                                          <DynamicLineChart data={allMonths.map(m => {
                                            const fullMonth = m.includes('-') ? m : `${selectedYear}-${m}`;
                                            const dataPoint: any = { month: m };
                                            Object.keys(group.products).forEach(prodName => {
                                              dataPoint[prodName] = yearlyPolicies
                                                .filter(row => {
                                                  const template = templatesById[row.templateId];
                                                  const resolved = resolveFromTemplate(template, row.product);
                                                  return (resolved.canonicalProduct || 'אחר') === prodName && row.reportMonth === fullMonth;
                                                })
                                                .reduce((sum, r) => sum + r.totalPremiumAmount, 0);
                                            });
                                            return dataPoint;
                                          })}>
                                            <DynamicCartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <DynamicXAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                            <DynamicYAxis tickFormatter={formatCurrency} width={60} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                            <DynamicTooltip contentStyle={{ borderRadius: '12px', border: 'none' }} formatter={(v: any) => [`${formatCurrency(v)} ₪`]} />
                                            <DynamicLegend verticalAlign="top" height={36} iconType="circle" />
                                            {Object.keys(group.products).map((prodName, idx) => (
                                              <DynamicLine key={prodName} type="monotone" dataKey={prodName} name={prodName} stroke={COLORS[idx % COLORS.length]} strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
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
              )}
            </div>
          )}

          {/* טבלה ראשית */}
          <table className="table-auto w-full border text-sm text-right mt-6">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-1 min-w-[90px] whitespace-nowrap">חודש</th>
                {allCompanies.map(company => (
                  <th key={company} className="border px-2 py-1">
                    <button type="button" className="w-full flex items-center justify-between gap-2 hover:bg-gray-100 rounded px-1 py-0.5" onClick={() => handleToggleExpandCompany(company)}>
                      <span>{company}</span>
                      <ChevronRight className={`h-4 w-4 transition-transform ${expanded?.company === company ? 'rotate-90' : ''}`} />
                    </button>
                  </th>
                ))}
                <th className="border px-2 py-1 font-bold bg-gray-50">סה&quot;כ לחודש</th>
              </tr>
            </thead>
            <tbody>
              {allMonths.map(month => {
                const monthTotal = allCompanies.reduce((sum, company) => sum + (summaryByMonthCompany[month]?.[company] || 0), 0);
                return (
                  <tr key={month}>
                    <td className="border px-3 py-1 font-semibold min-w-[90px] whitespace-nowrap">{month}</td>
                    {allCompanies.map(company => (
                      <td key={company} className="border px-2 py-1 cursor-pointer hover:bg-gray-100" onClick={() => handleToggleExpand(month, company)}>
                        {summaryByMonthCompany[month]?.[company]?.toLocaleString() ?? '-'}
                      </td>
                    ))}
                    <td className="border px-2 py-1 font-bold bg-gray-100">{monthTotal.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* פירוט חברה */}
          {selectedCompany && (
            <div className="mt-10">
              <h3 className="text-xl font-semibold mb-2">פירוט עבור חברה: {selectedCompany}</h3>
              <div className="flex items-center gap-2 mb-2">
                <button type="button" className="p-2 rounded border hover:bg-gray-100" onClick={() => drillScrollerRef.current?.scrollBy({ left: -400, behavior: 'smooth' })}><ChevronRight className="h-4 w-4" /></button>
                <button type="button" className="p-2 rounded border hover:bg-gray-100" onClick={() => drillScrollerRef.current?.scrollBy({ left: 400, behavior: 'smooth' })}><ChevronLeft className="h-4 w-4" /></button>
              </div>
              <div ref={drillScrollerRef} className="overflow-x-auto border rounded">
                <table className="table-auto min-w-max w-full text-sm text-right whitespace-nowrap">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border px-2 py-1 sticky right-0 z-10 bg-gray-100">חודש</th>
                      {Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {}).sort().map(agentCode => (
                        <th key={agentCode} className="border px-2 py-1">{agentCode}</th>
                      ))}
                      <th className="border px-2 py-1 font-bold bg-gray-50">סה&quot;כ לחודש</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(new Set(Object.values(summaryByCompanyAgentMonth[selectedCompany] || {}).flatMap(m => Object.keys(m)))).sort().map(month => {
                      const rowTotal = Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {}).reduce(
                        (sum, agentCode) => sum + (summaryByCompanyAgentMonth[selectedCompany]?.[agentCode]?.[month] || 0), 0
                      );
                      return (
                        <tr key={month}>
                          <td className="border px-2 py-1 font-semibold sticky right-0 z-10 bg-white">{month}</td>
                          {Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {}).sort().map(agentCode => (
                            <td key={agentCode} className="border px-2 py-1 cursor-pointer hover:bg-gray-100"
                              onClick={() => { const companyId = companyIdByName[selectedCompany]; if (!companyId) return; openDrill(companyId, agentCode, month); }}
                              title="לחץ לפירוט פוליסות">
                              {summaryByCompanyAgentMonth[selectedCompany]?.[agentCode]?.[month]?.toLocaleString() ?? '-'}
                            </td>
                          ))}
                          <td className="border px-2 py-1 font-bold bg-gray-100">{rowTotal.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* גרפים */}
          {allMonths.length > 0 && (
            <div className="mt-10 space-y-10">
              <section>
                <h3 className="text-xl font-semibold mb-3">גרף תפוקות לפי חודש (סה&quot;כ חודשי)</h3>
                <div className="w-full h-80 rounded-xl border bg-white">
                  {isMounted && (
                    <DynamicResponsiveContainer width="100%" height="100%">
                      <DynamicLineChart data={monthlyTotalsData} margin={{ top: 10, right: 64, left: 10, bottom: 28 }}>
                        <DynamicCartesianGrid strokeDasharray="3 3" />
                        <DynamicXAxis dataKey="month" interval={0} height={50} tickMargin={10} padding={{ left: 10, right: 28 }} />
                        <DynamicYAxis tickFormatter={formatCurrency} width={80} />
                        <DynamicTooltip formatter={(value: any) => [formatCurrency(value), 'סה"כ תפוקה']} labelFormatter={(label: any) => `חודש: ${label}`} />
                        <DynamicLine type="monotone" dataKey="total" stroke={palette[0]} strokeWidth={3} dot={{ r: 3 }} name='סה"כ' />
                      </DynamicLineChart>
                    </DynamicResponsiveContainer>
                  )}
                </div>
              </section>
              <section>
                <h3 className="text-xl font-semibold mb-3">גרף תפוקות לפי חברה (התפתחות חודשית)</h3>
                <div className="w-full h-96 rounded-2xl border bg-white shadow-sm p-4" dir="rtl">
                  {isMounted && (
                    <DynamicResponsiveContainer width="100%" height="100%">
                      <DynamicLineChart data={perCompanyOverMonthsData} margin={{ top: 10, right: 10, left: 10, bottom: 28 }}>
                        <DynamicCartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <DynamicXAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                        <DynamicYAxis tickFormatter={formatCurrency} width={80} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                        <DynamicTooltip formatter={(value: any, key: any) => [formatCurrency(value), key]} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                        <DynamicLegend {...({ iconType: "circle", verticalAlign: "top", height: 36 } as any)} />
                        {allCompanies.map((company, idx) => (
                          <DynamicLine key={company} type="monotone" dataKey={company} stroke={COLORS[idx % COLORS.length]} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} name={company} />
                        ))}
                      </DynamicLineChart>
                    </DynamicResponsiveContainer>
                  )}
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {/* מודאל דריל */}
      {drill && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" dir="rtl">
          <div className="bg-white w-[min(1100px,95vw)] max-h-[85vh] overflow-auto rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">פירוט תפוקות | חודש {drill.month} | מספר סוכן {drill.agentCode}</div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={exportDrillToExcel} title="ייצוא לאקסל" className={`p-1 rounded hover:bg-gray-100 ${drillRows.length ? '' : 'opacity-50 cursor-not-allowed'}`} disabled={!drillRows.length}>
                  <img src="/static/img/excel-icon.svg" alt="ייצוא לאקסל" width={24} height={24} />
                </button>
                <button className="px-3 py-1 border rounded" onClick={() => setDrill(null)}>סגור</button>
              </div>
            </div>
            {drillLoading ? <Spinner /> : (
              <table className="w-full text-sm border">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border px-2 py-1">פוליסה</th>
                    <th className="border px-2 py-1">ת״ז</th>
                    <th className="border px-2 py-1">לקוח</th>
                    <th className="border px-2 py-1">מוצר</th>
                    <th className="border px-2 py-1">תפוקה</th>
                    <th className="border px-2 py-1">חודש הצטרפות</th>
                  </tr>
                </thead>
                <tbody>
                  {drillRows.map(r => (
                    <tr key={`${r.policyNumberKey}_${r.customerId}`}>
                      <td className="border px-2 py-1">{r.policyNumberKey}</td>
                      <td className="border px-2 py-1">{r.customerId ?? '-'}</td>
                      <td className="border px-2 py-1">{r.fullName ?? '-'}</td>
                      <td className="border px-2 py-1">{resolveFromTemplate(templatesById[r.templateId], r.product).canonicalProduct || r.product || '-'}</td>
                      <td className="border px-2 py-1 font-semibold">{Number(r.totalPremiumAmount ?? 0).toLocaleString()}</td>
                      <td className="border px-2 py-1">{r.validMonth ?? r.reportMonth}</td>
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

export default CommissionSummaryHekefTab;
