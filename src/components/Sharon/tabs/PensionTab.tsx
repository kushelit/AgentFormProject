'use client';
// components/Sharon/tabs/PensionTab.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import DealFormModal from '@/components/DealFormModal/DealFormModal';

// ─── Types ───────────────────────────────────────────────────────────────────

type CustomerResult = {
  id: string;
  IDCustomer: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  phone?: string;
};

type SaleRow = {
  id: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  IDCustomer: string;
  product: string;
  company: string;
  mounth: string;
  statusPolicy: string;
  insPremia: string | number;
  pensiaPremia: string | number;
  pensiaZvira: string | number;
  finansimPremia: string | number;
  finansimZvira: string | number;
};

type Props = {
  agentId: string;
  customer: CustomerResult | null;
  onSelectCustomer: (c: CustomerResult) => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const PensionTab: React.FC<Props> = ({ agentId, customer, onSelectCustomer }) => {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // ─── מודל הוספה/עריכה של עסקה ───────────────────────────────────────────
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  const openNewDeal = () => {
    setEditingSaleId(null);
    setShowDealForm(true);
  };

  const openEditDeal = (saleId: string) => {
    setEditingSaleId(saleId);
    setShowDealForm(true);
  };

  const closeDealForm = () => {
    setShowDealForm(false);
    setEditingSaleId(null);
  };

  const handleRowSelectCustomer = async (idNumber: string) => {
    if (!agentId || !idNumber) return;
    try {
      const snap = await getDocs(query(
        collection(db, 'customer'),
        where('AgentId', '==', agentId),
        where('IDCustomer', '==', idNumber)
      ));
      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data();
        onSelectCustomer({
          id: d.id,
          IDCustomer: data.IDCustomer,
          firstNameCustomer: data.firstNameCustomer,
          lastNameCustomer: data.lastNameCustomer,
          phone: data.phone,
        });
      }
    } catch {}
  };

  const fetchSales = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const constraints: any[] = [
        where('AgentId', '==', agentId),
        where('statusPolicy', 'in', ['פעילה', 'הצעה']),
      ];
      if (customer) constraints.push(where('IDCustomer', '==', customer.IDCustomer));

      const q = query(collection(db, 'sales'), ...constraints);
      const snap = await getDocs(q);
      const rows: SaleRow[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<SaleRow, 'id'>),
      }));

      // sort by date desc
      rows.sort((a, b) => new Date(b.mounth).getTime() - new Date(a.mounth).getTime());
      setSales(rows);
    } finally {
      setLoading(false);
    }
  }, [agentId, customer]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  // unique values for filters
  const companies = [...new Set(sales.map(s => s.company).filter(Boolean))];
  const statuses = [...new Set(sales.map(s => s.statusPolicy).filter(Boolean))];

  const filtered = sales.filter(s =>
    (!filterCompany || s.company === filterCompany) &&
    (!filterStatus || s.statusPolicy === filterStatus)
  );

  const totalPremia = filtered.reduce((sum, s) => sum + (parseFloat(String(s.insPremia)) || 0) + (parseFloat(String(s.pensiaPremia)) || 0) + (parseFloat(String(s.finansimPremia)) || 0), 0);
  const totalZvira = filtered.reduce((sum, s) => sum + (parseFloat(String(s.pensiaZvira)) || 0) + (parseFloat(String(s.finansimZvira)) || 0), 0);

  return (
    <div>
      {/* Readonly note + כפתור הוספה */}
      <div className="sharon-readonly-note" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>👁 קריאה בלבד — נתונים מתוך מערכת MagicSale</span>
        {agentId && (
          <button
            type="button"
            onClick={openNewDeal}
            className="sharon-inline-btn"
            style={{ marginRight: 'auto' }}
          >
            + הוסף עסקה{customer ? ` ל${customer.firstNameCustomer} ${customer.lastNameCustomer}` : ''}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="sharon-filter-row">
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="">כל החברות</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">כל הסטטוסים</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="sharon-table-wrap">
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>טוען...</div>
        ) : (
          <table className="sharon-table">
            <thead>
              <tr>
                <th>חודש</th>
                <th>שם</th>
               <th>ת&quot;ז</th>
                <th>מוצר</th>
                <th>חברה</th>
                <th>סטטוס</th>
                <th>פרמיה ביטוח</th>
                <th>פרמיה פנסיה</th>
                <th>צבירה פנסיה</th>
                <th>פרמיה פיננסים</th>
                <th>צבירה פיננסים</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
            {filtered.map(sale => (
  <tr key={sale.id} onClick={() => handleRowSelectCustomer(sale.IDCustomer)} style={{ cursor: 'pointer' }}>
    <td>{formatDate(sale.mounth)}</td>
                  <td>{sale.firstNameCustomer} {sale.lastNameCustomer}</td>
                  <td>{sale.IDCustomer}</td>
                  <td>{sale.product}</td>
                  <td>{sale.company}</td>
                  <td>
                    <span className={`sharon-pill ${
                      sale.statusPolicy === 'פעילה' ? 'sharon-pill-green' : 'sharon-pill-blue'
                    }`}>
                      {sale.statusPolicy}
                    </span>
                  </td>
                  <td>{sale.insPremia ? parseFloat(String(sale.insPremia)).toLocaleString() : '—'}</td>
                  <td>{sale.pensiaPremia ? parseFloat(String(sale.pensiaPremia)).toLocaleString() : '—'}</td>
                  <td>{sale.pensiaZvira ? parseFloat(String(sale.pensiaZvira)).toLocaleString() : '—'}</td>
                  <td>{sale.finansimPremia ? parseFloat(String(sale.finansimPremia)).toLocaleString() : '—'}</td>
                  <td>{sale.finansimZvira ? parseFloat(String(sale.finansimZvira)).toLocaleString() : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="sharon-inline-btn"
                      style={{ background: '#5F5E5A' }}
                      onClick={() => openEditDeal(sale.id)}
                      title="עריכת עסקה"
                    >
                      ✏️
                    </button>
                  </td>
                </tr>
              ))}

              {filtered.length > 0 && (
                <tr className="sum-row">
<td colSpan={6} style={{ fontSize: 12, color: '#5F5E5A' }}>
  {'סה"כ'} — {filtered.length} רשומות
</td>
                  <td colSpan={2}>{totalPremia.toLocaleString()}</td>
                  <td colSpan={3}>{totalZvira.toLocaleString()}</td>
                  <td></td>
                </tr>
              )}

              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: 20, color: '#888' }}>
                    {customer ? 'אין נתונים פנסיוניים ללקוח זה' : 'בחר לקוח לצפייה בנתונים'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* מודל הוספה/עריכה של עסקה */}
      {showDealForm && agentId && (
        <DealFormModal
          defaultAgentId={agentId}
          editingSaleId={editingSaleId}
          initialCustomer={!editingSaleId && customer ? {
            IDCustomer: customer.IDCustomer,
            firstNameCustomer: customer.firstNameCustomer,
            lastNameCustomer: customer.lastNameCustomer,
            phone: customer.phone,
          } : null}
          onClose={closeDealForm}
          onSaved={fetchSales}
        />
      )}
    </div>
  );
};

export default PensionTab;
