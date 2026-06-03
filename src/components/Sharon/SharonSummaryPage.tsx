'use client';
// components/Sharon/SharonSummaryPage.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import './SharonPage.css';


// ─── Types ───────────────────────────────────────────────────────────────────

type MonthRow = {
  month: string; // "MM/YY"
  pensionHekef: number;
  pensionNifraim: number;
  elementary: number;
  taxSharon: number;
  total: number;
};

type CustomerRow = {
  customerId: string;
  customerName: string;
  pensionHekef: number;
  pensionNifraim: number;
  elementary: number;
  taxSharon: number;
  total: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMonthKey(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}

function toYearMonth(dateStr: string): string {
  // returns "YYYY-MM" for filtering
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const SharonSummaryPage: React.FC = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const effectiveAgentId = detail?.role === 'admin'
    ? selectedAgentId
    : detail?.agentId || '';

  // ─── Filters ─────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'month' | 'customer'>('month');
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterMonth, setFilterMonth] = useState(''); // "01"–"12" or ""
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterCompany, setFilterCompany] = useState('');

  // ─── Raw data ────────────────────────────────────────────────────────────
  const [sales, setSales] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [elementaryPolicies, setElementaryPolicies] = useState<any[]>([]);
  const [taxClients, setTaxClients] = useState<any[]>([]);

  // ─── Fetch all data ───────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!effectiveAgentId) return;

    const [salesSnap, contractsSnap, productsSnap, elemSnap, taxSnap] = await Promise.all([
      getDocs(query(
        collection(db, 'sales'),
        where('AgentId', '==', effectiveAgentId),
        where('statusPolicy', 'in', ['פעילה', 'הצעה']),
      )),
      getDocs(query(collection(db, 'contracts'), where('AgentId', '==', effectiveAgentId))),
      getDocs(collection(db, 'product')),
      getDocs(query(collection(db, 'elementaryPolicies'), where('agentId', '==', effectiveAgentId))),
      getDocs(query(collection(db, 'taxReturnClients'), where('agentId', '==', effectiveAgentId))),
    ]);

    setSales(salesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setContracts(contractsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setElementaryPolicies(elemSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setTaxClients(taxSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, [effectiveAgentId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Commission calc for pension ─────────────────────────────────────────
  const calcPensionCommission = (sale: any): { hekef: number; nifraim: number } => {
    const productMap: Record<string, any> = {};
    products.forEach(p => { productMap[p.productName] = p; });

    const product = productMap[sale.product];
    const isOneTime = product?.isOneTime ?? false;
    const multiplier = isOneTime ? 1 : 12;

    const contract = contracts.find(c =>
      c.AgentId === effectiveAgentId &&
      c.company === sale.company &&
      c.product === sale.product &&
      Boolean(c.minuySochen) === Boolean(sale.minuySochen)
    ) || contracts.find(c =>
      c.AgentId === effectiveAgentId &&
      c.productsGroup === (product?.productGroup || '') &&
      Boolean(c.minuySochen) === Boolean(sale.minuySochen)
    );

    if (!contract) return { hekef: 0, nifraim: 0 };

    const ins = parseFloat(sale.insPremia) || 0;
    const pensia = parseFloat(sale.pensiaPremia) || 0;
    const pensiaZ = parseFloat(sale.pensiaZvira) || 0;
    const finP = parseFloat(sale.finansimPremia) || 0;
    const finZ = parseFloat(sale.finansimZvira) || 0;

    const hekef = Math.round(
      ins * (contract.commissionHekef / 100) * multiplier +
      pensia * (contract.commissionHekef / 100) * multiplier +
      pensiaZ * (contract.commissionNiud / 100) +
      finP * (contract.commissionHekef / 100) * multiplier +
      finZ * (contract.commissionNiud / 100)
    );

    const nifraim = isOneTime ? 0 : Math.round(
      ins * (contract.commissionNifraim / 100) +
      pensia * (contract.commissionNifraim / 100) +
      finZ * (contract.commissionNifraim / 100) / 12
    );

    return { hekef, nifraim };
  };

  // ─── Date filter helper ───────────────────────────────────────────────────
  const matchesDateFilter = (dateStr: string): boolean => {
    const ym = toYearMonth(dateStr);
    if (!ym) return false;
    const [y, m] = ym.split('-');
    if (filterYear && y !== filterYear) return false;
    if (filterMonth && m !== filterMonth) return false;
    return true;
  };

  // ─── Aggregation — by month ───────────────────────────────────────────────
  const monthRows = useMemo((): MonthRow[] => {
    const map: Record<string, MonthRow> = {};

    const ensure = (key: string) => {
      if (!map[key]) map[key] = { month: key, pensionHekef: 0, pensionNifraim: 0, elementary: 0, taxSharon: 0, total: 0 };
    };

    // Pension
    sales.forEach(sale => {
      if (!matchesDateFilter(sale.mounth)) return;
      if (filterCompany && sale.company !== filterCompany) return;
      const key = toMonthKey(sale.mounth);
      if (!key) return;
      ensure(key);
      const { hekef, nifraim } = calcPensionCommission(sale);
      map[key].pensionHekef += hekef;
      map[key].pensionNifraim += nifraim;
    });

    // Elementary
    elementaryPolicies.forEach(p => {
      if (!matchesDateFilter(p.startDate)) return;
      if (filterCompany && p.company !== filterCompany) return;
      const key = toMonthKey(p.startDate);
      if (!key) return;
      ensure(key);
      map[key].elementary += parseFloat(p.commission) || 0;
    });

    // Tax
    taxClients.forEach(t => {
      if (!matchesDateFilter(t.startDate)) return;
      const key = toMonthKey(t.startDate);
      if (!key) return;
      ensure(key);
      map[key].taxSharon += parseFloat(t.sharonCommission) || 0;
    });

    // totals
    Object.values(map).forEach(r => {
      r.total = r.pensionHekef + r.pensionNifraim + r.elementary + r.taxSharon;
    });

    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  }, [sales, elementaryPolicies, taxClients, filterYear, filterMonth, filterCompany]);

  // ─── Aggregation — by customer ────────────────────────────────────────────
  const customerRows = useMemo((): CustomerRow[] => {
    const map: Record<string, CustomerRow> = {};

    const ensure = (id: string, name: string) => {
      if (!map[id]) map[id] = { customerId: id, customerName: name, pensionHekef: 0, pensionNifraim: 0, elementary: 0, taxSharon: 0, total: 0 };
    };

    sales.forEach(sale => {
      if (!matchesDateFilter(sale.mounth)) return;
      if (filterCompany && sale.company !== filterCompany) return;
      if (filterCustomer && !`${sale.firstNameCustomer} ${sale.lastNameCustomer}`.includes(filterCustomer) && sale.IDCustomer !== filterCustomer) return;
      const id = sale.IDCustomer || sale.id;
      ensure(id, `${sale.firstNameCustomer || ''} ${sale.lastNameCustomer || ''}`.trim());
      const { hekef, nifraim } = calcPensionCommission(sale);
      map[id].pensionHekef += hekef;
      map[id].pensionNifraim += nifraim;
    });

    elementaryPolicies.forEach(p => {
      if (!matchesDateFilter(p.startDate)) return;
      if (filterCompany && p.company !== filterCompany) return;
      if (filterCustomer && !p.customerName?.includes(filterCustomer) && p.customerId !== filterCustomer) return;
      const id = p.customerId || p.id;
      ensure(id, p.customerName || id);
      map[id].elementary += parseFloat(p.commission) || 0;
    });

    taxClients.forEach(t => {
      if (!matchesDateFilter(t.startDate)) return;
      if (filterCustomer && !t.fullName?.includes(filterCustomer) && t.idNumber !== filterCustomer) return;
      const id = t.customerId || t.idNumber || t.id;
      ensure(id, t.fullName || id);
      map[id].taxSharon += parseFloat(t.sharonCommission) || 0;
    });

    Object.values(map).forEach(r => {
      r.total = r.pensionHekef + r.pensionNifraim + r.elementary + r.taxSharon;
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [sales, elementaryPolicies, taxClients, filterYear, filterMonth, filterCompany, filterCustomer]);

  // ─── Grand totals ─────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const rows = viewMode === 'month' ? monthRows : customerRows;
    return {
      pensionHekef: rows.reduce((s, r) => s + r.pensionHekef, 0),
      pensionNifraim: rows.reduce((s, r) => s + r.pensionNifraim, 0),
      elementary: rows.reduce((s, r) => s + r.elementary, 0),
      taxSharon: rows.reduce((s, r) => s + r.taxSharon, 0),
      total: rows.reduce((s, r) => s + r.total, 0),
    };
  }, [monthRows, customerRows, viewMode]);

  // ─── Companies for filter ─────────────────────────────────────────────────
  const allCompanies = useMemo(() => {
    const set = new Set<string>();
    sales.forEach(s => s.company && set.add(s.company));
    elementaryPolicies.forEach(p => p.company && set.add(p.company));
    return [...set].sort();
  }, [sales, elementaryPolicies]);

  const years = useMemo(() => {
    const set = new Set<string>();
    const now = new Date().getFullYear();
    for (let y = now; y >= now - 4; y--) set.add(String(y));
    return [...set];
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
  const fmt = (n: number) => n ? n.toLocaleString() : '—';

  return (
    <div className="sharon-page" dir="rtl">

      {/* Topbar */}
      <div className="sharon-topbar">
        <span className="sharon-topbar-title">עמלות מסכם</span>
        {detail?.role === 'admin' && (
          <select value={selectedAgentId} onChange={handleAgentChange} className="select-input">
            <option value="">בחר סוכן</option>
            {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <button
          onClick={fetchAll}
          style={{ marginRight: 'auto', fontSize: 12, padding: '4px 10px', border: '1px solid #B4B2A9', borderRadius: 6, background: 'white', cursor: 'pointer' }}
        >
          🔄 רענן
        </button>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, padding: '12px 16px' }}>
        {[
          { label: 'היקף פנסיוני', value: totals.pensionHekef },
          { label: 'נפרעים פנסיוני', value: totals.pensionNifraim },
          { label: 'עמלת אלמנטרי', value: totals.elementary },
          { label: 'עמלת שרון (החזרי מס)', value: totals.taxSharon },
          { label: 'סה"כ עמלת שרון', value: totals.total, highlight: true },
        ].map(card => (
          <div key={card.label} style={{
            background: card.highlight ? '#E6F1FB' : '#F5F7FA',
            borderRadius: 6,
            padding: '10px 12px',
          }}>
            <div style={{ fontSize: 11, color: card.highlight ? '#0C447C' : '#5F5E5A', marginBottom: 4 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, color: card.highlight ? '#185FA5' : '#1A1A2E' }}>
              {card.value.toLocaleString()} ₪
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="sharon-filter-row">
        {/* View toggle */}
        <div style={{ display: 'flex', background: '#E6F1FB', borderRadius: 20, padding: 2, gap: 2 }}>
          <button
            onClick={() => setViewMode('month')}
            style={{ padding: '3px 12px', borderRadius: 20, border: 'none', fontSize: 12, cursor: 'pointer', background: viewMode === 'month' ? 'white' : 'transparent', fontWeight: viewMode === 'month' ? 500 : 400, color: viewMode === 'month' ? '#185FA5' : '#5F5E5A' }}
          >
            לפי חודש
          </button>
          <button
            onClick={() => setViewMode('customer')}
            style={{ padding: '3px 12px', borderRadius: 20, border: 'none', fontSize: 12, cursor: 'pointer', background: viewMode === 'customer' ? 'white' : 'transparent', fontWeight: viewMode === 'customer' ? 500 : 400, color: viewMode === 'customer' ? '#185FA5' : '#5F5E5A' }}
          >
            לפי לקוח
          </button>
        </div>

        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}>
          <option value="">כל השנים</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="">כל החודשים</option>
          {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="">כל החברות</option>
          {allCompanies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {viewMode === 'customer' && (
          <input
            type="text"
            placeholder="חיפוש לקוח..."
            value={filterCustomer}
            onChange={e => setFilterCustomer(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', border: '1px solid #B4B2A9', borderRadius: 6 }}
          />
        )}
      </div>

      {/* Table */}
      <div className="sharon-table-wrap">
        <table className="sharon-table">
          <thead>
            <tr>
              <th>{viewMode === 'month' ? 'חודש' : 'לקוח'}</th>
              <th>היקף פנסיוני</th>
              <th>נפרעים פנסיוני</th>
              <th>עמלת אלמנטרי</th>
              <th>עמלת שרון (החזרי מס)</th>
             <th>סה&quot;כ עמלת שרון</th>
            </tr>
          </thead>
          <tbody>
            {viewMode === 'month' ? (
              monthRows.map(row => (
                <tr key={row.month}>
                  <td style={{ fontWeight: 500 }}>{row.month}</td>
                  <td>{fmt(row.pensionHekef)}</td>
                  <td>{fmt(row.pensionNifraim)}</td>
                  <td>{fmt(row.elementary)}</td>
                  <td>{fmt(row.taxSharon)}</td>
                  <td className="commission-cell">{fmt(row.total)}</td>
                </tr>
              ))
            ) : (
              customerRows.map(row => (
                <tr key={row.customerId}>
                  <td style={{ fontWeight: 500 }}>{row.customerName || row.customerId}</td>
                  <td>{fmt(row.pensionHekef)}</td>
                  <td>{fmt(row.pensionNifraim)}</td>
                  <td>{fmt(row.elementary)}</td>
                  <td>{fmt(row.taxSharon)}</td>
                  <td className="commission-cell">{fmt(row.total)}</td>
                </tr>
              ))
            )}

            {/* Summary row */}
            <tr className="sum-row">
             <td>סה&quot;כ</td>
              <td>{fmt(totals.pensionHekef)}</td>
              <td>{fmt(totals.pensionNifraim)}</td>
              <td>{fmt(totals.elementary)}</td>
              <td>{fmt(totals.taxSharon)}</td>
              <td className="commission-cell">{fmt(totals.total)}</td>
            </tr>
          </tbody>
        </table>

        {monthRows.length === 0 && viewMode === 'month' && (
          <div style={{ textAlign: 'center', padding: 24, color: '#888', fontSize: 13 }}>
            אין נתונים לתקופה הנבחרת
          </div>
        )}
      </div>
    </div>
  );
};

export default SharonSummaryPage;
