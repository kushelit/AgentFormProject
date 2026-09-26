'use client';
// src/components/commission/summary/ProductsTab.tsx
// עמלות לפי קבוצת מוצר / מוצר / חברה — לפי חודש פרסום
import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import useFetchMD from '@/hooks/useMD';
import type { ProductsSummary } from '@/types/agentInsights';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from './charts';
import { CHART_COLORS, fmtInt, fmtMoney } from './ui';
import t from './table.module.css';

interface Props {
  year: string;
  products: ProductsSummary | null;
  loading: boolean;
}

type ProductNode = { total: number; companies: Record<string, number> };
type GroupNode = { name: string; total: number; products: Record<string, ProductNode> };

const ProductsTab: React.FC<Props> = ({ year, products, loading }) => {
  const { productGroupMap, productToGroupMap } = useFetchMD();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const groups: GroupNode[] = useMemo(() => {
    if (!products) return [];
    const g: Record<string, GroupNode> = {};
    for (const r of products.byCompany) {
      const groupId = (productToGroupMap as any)?.[r.product] || r.productGroup || '';
      const groupName = (productGroupMap as any)?.[groupId] || (groupId ? `קבוצה ${groupId}` : 'ללא סיווג');
      if (!g[groupName]) g[groupName] = { name: groupName, total: 0, products: {} };
      if (!g[groupName].products[r.product]) g[groupName].products[r.product] = { total: 0, companies: {} };
      g[groupName].total += r.amount;
      g[groupName].products[r.product].total += r.amount;
      g[groupName].products[r.product].companies[r.company] =
        (g[groupName].products[r.product].companies[r.company] || 0) + r.amount;
    }
    return Object.values(g).sort((a, b) => b.total - a.total);
  }, [products, productGroupMap, productToGroupMap]);

  const { months, productMonth } = useMemo(() => {
    const pm: Record<string, Record<string, number>> = {};
    const ms = new Set<string>();
    for (const r of products?.byMonth ?? []) {
      ms.add(r.ym);
      if (!pm[r.product]) pm[r.product] = {};
      pm[r.product][r.ym] = (pm[r.product][r.ym] || 0) + r.amount;
    }
    return { months: Array.from(ms).sort(), productMonth: pm };
  }, [products]);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  const pieData = groups.map((g, i) => ({ name: g.name, total: g.total, fill: CHART_COLORS[i % CHART_COLORS.length] }));

  const exportToExcel = () => {
    const rows: any[] = [];
    groups.forEach((group) => {
      Object.entries(group.products).forEach(([prodName, prod]) => {
        Object.entries(prod.companies).forEach(([company, amount]) => {
          rows.push({
            'קבוצת מוצר': group.name,
            'מוצר': prodName,
            'חברה': company,
            'סכום עמלה': amount,
            'שנה': year,
            'נתח מהמוצר': `${prod.total ? ((amount / prod.total) * 100).toFixed(1) : 0}%`,
            'נתח מהקבוצה': `${group.total ? ((amount / group.total) * 100).toFixed(1) : 0}%`,
          });
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'עמלות לפי מוצר');
    XLSX.writeFile(wb, `עמלות_לפי_מוצר_${year}.xlsx`);
  };

  if (loading) return <div className="h-80 bg-slate-100 rounded-2xl animate-pulse" />;
  if (!groups.length) {
    return <div className="p-6 text-sm text-slate-500 border rounded-2xl bg-white">אין נתוני מוצרים לשנה {year}.</div>;
  }

  return (
    <div className="space-y-6">
      {/* ─── התפלגות ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-5 h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 20, right: 70, bottom: 20, left: 70 }}>
              <Pie
                data={pieData}
                dataKey="total"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                paddingAngle={3}
                minAngle={10}
                labelLine
                label={({ cx, cy, midAngle, outerRadius, percent, name }: any) => {
                  const RAD = Math.PI / 180;
                  const r = outerRadius + 22;
                  const x = cx + r * Math.cos(-midAngle * RAD);
                  const y = cy + r * Math.sin(-midAngle * RAD);
                  return (
                    <text x={x} y={y} fill="#4b5563" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" style={{ fontSize: 12, fontWeight: 700 }}>
                      {`${name} ${(percent * 100).toFixed(0)}%`}
                    </text>
                  );
                }}
              >
                {pieData.map((d, i) => (
                  <Cell key={i} fill={d.fill} stroke="#fff" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => [`${fmtMoney(v)} ₪`, 'עמלה']} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-black text-slate-800">עמלות לפי קבוצת מוצר · {year}</h3>
            <span className="text-xs text-slate-500">סה&quot;כ {fmtInt(grandTotal)} ₪</span>
          </div>
          {groups.map((g, i) => (
            <div key={g.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="font-bold text-slate-700">{g.name}</span>
              </div>
              <div className="font-black text-indigo-600">{fmtInt(g.total)} ₪</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── פירוט מוצרים ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b bg-slate-50">
          <div className="font-bold text-slate-700">פירוט לפי מוצר וחברה</div>
          <button
            type="button"
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 text-xs"
          >
            <img src="/static/img/excel-icon.svg" width={16} height={16} alt="Excel" />
            ייצוא לאקסל
          </button>
        </div>
        <table className={`${t.cleanTable} text-sm`}>
          <thead className="text-slate-500 text-xs border-b">
            <tr>
              <th className="px-6 py-3">מוצר</th>
              <th className={`px-6 py-3 ${t.center}`}>עמלה</th>
              <th className="px-6 py-3">פילוח חברות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((group) => {
              const isOpen = expandedGroup === group.name;
              const productNames = Object.keys(group.products);
              return (
                <React.Fragment key={group.name}>
                  <tr
                    className="bg-indigo-50/30 cursor-pointer hover:bg-indigo-50"
                    onClick={() => setExpandedGroup(isOpen ? null : group.name)}
                  >
                    <td className="px-6 py-3 font-black text-slate-800">
                      {group.name} <span className="text-xs text-slate-400">{isOpen ? '▲ הסתר מגמה' : '▼ הצג מגמה'}</span>
                    </td>
                    <td className={`px-6 py-3 font-black ${t.center}`}>{fmtInt(group.total)} ₪</td>
                    <td />
                  </tr>

                  {isOpen && (
                    <tr>
                      <td colSpan={3} className="px-6 py-6 bg-slate-50/60">
                        <div className="bg-white p-4 rounded-2xl border border-slate-200">
                          <div className="text-sm font-bold text-slate-700 mb-2">מגמת מוצרים · {group.name} · לפי חודש פרסום</div>
                          <div className="h-72" dir="ltr">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={months.map((ym) => {
                                  const p: any = { ym };
                                  productNames.forEach((name) => {
                                    p[name] = productMonth[name]?.[ym] ?? 0;
                                  });
                                  return p;
                                })}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <YAxis tickFormatter={fmtInt} width={60} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <Tooltip formatter={(v: any) => [`${fmtMoney(v)} ₪`]} contentStyle={{ borderRadius: 12, border: 'none' }} />
                                <Legend verticalAlign="top" height={32} iconType="circle" />
                                {productNames.map((name, idx) => (
                                  <Line key={name} type="monotone" dataKey={name} name={name} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={3} dot={{ r: 3 }} connectNulls />
                                ))}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {Object.entries(group.products)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([prodName, prod]) => {
                      const companies = Object.entries(prod.companies).sort((a, b) => b[1] - a[1]);
                      return (
                        <tr key={prodName} className="hover:bg-slate-50">
                          <td className="pr-12 py-3 text-slate-600">📦 {prodName}</td>
                          <td className={`px-6 py-3 font-bold ${t.center}`}>{fmtInt(prod.total)} ₪</td>
                          <td className="px-6 py-3 w-[45%]">
                            <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-slate-100">
                              {companies.map(([c, amt], i) => (
                                <div
                                  key={c}
                                  title={`${c}: ${fmtInt(amt)} ₪`}
                                  style={{ width: `${prod.total ? (amt / prod.total) * 100 : 0}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                                />
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                              {companies.map(([c, amt], i) => (
                                <span key={c} className="text-[11px] text-slate-600 flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                  {c} ({prod.total ? ((amt / prod.total) * 100).toFixed(0) : 0}%)
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductsTab;
