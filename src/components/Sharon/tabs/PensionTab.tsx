'use client';
// components/Sharon/tabs/PensionTab.tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import DealFormModal from '@/components/DealFormModal/DealFormModal';
import ImportRunsManager from '@/components/ImportRunsManager/ImportRunsManager';
import useFetchMD from '@/hooks/useMD';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';

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
  kupaAction?: string;
  kupaStatus?: string;
  needsCorrection?: boolean;
  referrerName?: string;
};

type Props = {
  agentId: string;
  customer: CustomerResult | null;
  onSelectCustomer: (c: CustomerResult) => void;
  /** אם מוגדר: מציג רק עסקאות ששייכות לאחת מקבוצות המוצר האלה (למשל ['1','4'] = פנסיה+פיננסים) */
  includeGroupIds?: string[];
  /** אם מוגדר (ו-includeGroupIds לא מוגדר): מציג הכל חוץ מהקבוצות האלה (למשל טאב "סיכונים") */
  excludeGroupIds?: string[];
  /** ההקשר שמועבר ל-DealFormModal כדי להציג בו שדות ייחודיים לטאב הזה (למשל 'risk') */
  dealFormContext?: 'risk' | 'pension_finance' | 'general';
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const PensionTab: React.FC<Props> = ({ agentId, customer, onSelectCustomer, includeGroupIds, excludeGroupIds, dealFormContext }) => {
  const { detail } = useAuth();
  const isAgency4 = String(detail?.agencyId ?? '') === '4';
  const { toasts, addToast, setToasts } = useToast();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterNeedsCorrection, setFilterNeedsCorrection] = useState('');
  const [filterReferrer, setFilterReferrer] = useState('');

  const { productToGroupMap } = useFetchMD();

  // מבצע התאמה של עסקה לקבוצת המוצר המבוקשת (פנסיה+פיננסים / סיכונים / הכל)
  const matchesGroupFilter = useCallback((productName: string) => {
    if (!includeGroupIds?.length && !excludeGroupIds?.length) return true; // אין סינון — מציגים הכל
    const groupId = productToGroupMap[(productName || '').trim()] || '';
    if (includeGroupIds?.length) return includeGroupIds.includes(groupId);
    if (excludeGroupIds?.length) return !excludeGroupIds.includes(groupId);
    return true;
  }, [includeGroupIds, excludeGroupIds, productToGroupMap]);

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

  // ─── ייבוא מאקסל — כרגע רק ל"פנסיה ופיננסים" ───────────────────────────
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [importErrorRows, setImportErrorRows] = useState<{ row: number; error: string }[] | null>(null);
  const [showImportRunsManager, setShowImportRunsManager] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // מסלול ה-API תלוי בטאב שממנו נפתח (כל אחד עם תבנית/ולידציה משלו)
  const importApiSlug = dealFormContext === 'risk' ? 'risk-template' : 'pension-finance-template';
  const canImport = dealFormContext === 'pension_finance' || dealFormContext === 'risk';

  const downloadImportTemplate = () => {
    if (!agentId) return;
    window.open(`/api/${importApiSlug}/download?agentId=${agentId}`, '_blank');
  };

  const handleUploadImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agentId) return;

    setIsUploadingExcel(true);
    setImportErrorRows(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('agentId', agentId);

      const res = await fetch(`/api/${importApiSlug}/upload`, { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        addToast('error', data.error || 'שגיאה בהעלאה');
        if (data.invalidRows?.length > 0) setImportErrorRows(data.invalidRows);
        return;
      }

      const invalidMsg = data.invalidCount > 0 ? ` (${data.invalidCount} שורות נכשלו)` : '';
      addToast('success', `הועלה בהצלחה — ${data.writeCount} עסקאות נשמרו${invalidMsg}`);
      if (data.invalidRows?.length > 0) setImportErrorRows(data.invalidRows);
      await fetchSales();
    } finally {
      setIsUploadingExcel(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
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

  // unique values for filters — מחושבים אחרי סינון הקבוצה, כדי שהפילטרים יראו רק ערכים רלוונטיים
  const groupFilteredSales = sales.filter(s => matchesGroupFilter(s.product));
  const companies = [...new Set(groupFilteredSales.map(s => s.company).filter(Boolean))];
  const statuses = [...new Set(groupFilteredSales.map(s => s.statusPolicy).filter(Boolean))];
  const referrerOptions = [...new Set(groupFilteredSales.map(s => s.referrerName).filter(Boolean))] as string[];

  const filtered = groupFilteredSales.filter(s =>
    (!filterCompany || s.company === filterCompany) &&
    (!filterStatus || s.statusPolicy === filterStatus) &&
    (!filterNeedsCorrection || (filterNeedsCorrection === 'true' ? !!s.needsCorrection : !s.needsCorrection)) &&
    (!filterReferrer || s.referrerName === filterReferrer)
  );

  const totalPremia = filtered.reduce((sum, s) => sum + (parseFloat(String(s.insPremia)) || 0) + (parseFloat(String(s.pensiaPremia)) || 0) + (parseFloat(String(s.finansimPremia)) || 0), 0);
  const totalZvira = filtered.reduce((sum, s) => sum + (parseFloat(String(s.pensiaZvira)) || 0) + (parseFloat(String(s.finansimZvira)) || 0), 0);

  // אילו עמודות פרמיה/צבירה מוצגות — תלוי בטאב שממנו הגענו
  const showInsPremia = dealFormContext !== 'pension_finance'; // מוצג בסיכונים, מוסתר בפנסיה+פיננסים
  const showPensionFinanceCols = dealFormContext !== 'risk';   // מוצג בפנסיה+פיננסים, מוסתר בסיכונים
  const showNeedsCorrectionCol = dealFormContext === 'risk';   // מוצג רק בסיכונים
  const showReferrerCol = isAgency4;                            // מוצג ב-agency4, בכל לשונית (פנסיה+פיננסים וגם סיכונים)
  const totalColumns = 6 + (showInsPremia ? 1 : 0) + (showPensionFinanceCols ? 6 : 0) + (showNeedsCorrectionCol ? 1 : 0) + (showReferrerCol ? 1 : 0) + 1; // +1 = עמודת פעולות

  return (
    <div>
      {/* Readonly note + כפתורי הוספה/ייבוא */}
      <div className="sharon-readonly-note" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span>👁 קריאה בלבד — נתונים מתוך מערכת MagicSale</span>
        <div style={{ display: 'flex', gap: 8, marginRight: 'auto' }}>
          {agentId && canImport && (
            <>
              <button type="button" onClick={downloadImportTemplate} className="sharon-inline-btn" style={{ background: '#5F5E5A' }}>
                הורד תבנית אקסל
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={handleUploadImportExcel}
              />
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="sharon-inline-btn"
                style={{ background: '#5F5E5A' }}
                disabled={isUploadingExcel}
              >
                {isUploadingExcel ? 'מעלה...' : 'העלה אקסל'}
              </button>
              <button
                type="button"
                onClick={() => setShowImportRunsManager(true)}
                className="sharon-inline-btn"
                style={{ background: '#5F5E5A' }}
              >
                ניהול טעינות
              </button>
            </>
          )}
          {agentId && (
            <button type="button" onClick={openNewDeal} className="sharon-inline-btn">
              + הוסף עסקה{customer ? ` ל${customer.firstNameCustomer} ${customer.lastNameCustomer}` : ''}
            </button>
          )}
        </div>
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
        {showNeedsCorrectionCol && (
          <select value={filterNeedsCorrection} onChange={e => setFilterNeedsCorrection(e.target.value)}>
            <option value="">נדרש תיקון (הכל)</option>
            <option value="true">כן</option>
            <option value="false">לא</option>
          </select>
        )}
        {showReferrerCol && (
          <select value={filterReferrer} onChange={e => setFilterReferrer(e.target.value)}>
            <option value="">כל הנציגים המפנים</option>
            {referrerOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
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
                {showInsPremia && <th>פרמיה ביטוח</th>}
                {showNeedsCorrectionCol && <th>נדרש תיקון</th>}
                {showReferrerCol && <th>נציג מפנה</th>}
                {showPensionFinanceCols && (
                  <>
                    <th>פרמיה פנסיה</th>
                    <th>צבירה פנסיה</th>
                    <th>פרמיה פיננסים</th>
                    <th>צבירה פיננסים</th>
                    <th>סוג פעולה</th>
                    <th>סטטוס קופה</th>
                  </>
                )}
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
                  {showInsPremia && (
                    <td>{sale.insPremia ? parseFloat(String(sale.insPremia)).toLocaleString() : '—'}</td>
                  )}
                  {showNeedsCorrectionCol && (
                    <td>
                      {sale.statusPolicy === 'פעילה' ? (sale.needsCorrection ? 'כן' : 'לא') : '—'}
                    </td>
                  )}
                  {showReferrerCol && <td>{sale.referrerName || '—'}</td>}
                  {showPensionFinanceCols && (
                    <>
                      <td>{sale.pensiaPremia ? parseFloat(String(sale.pensiaPremia)).toLocaleString() : '—'}</td>
                      <td>{sale.pensiaZvira ? parseFloat(String(sale.pensiaZvira)).toLocaleString() : '—'}</td>
                      <td>{sale.finansimPremia ? parseFloat(String(sale.finansimPremia)).toLocaleString() : '—'}</td>
                      <td>{sale.finansimZvira ? parseFloat(String(sale.finansimZvira)).toLocaleString() : '—'}</td>
                      <td>{sale.kupaAction || '—'}</td>
                      <td>{sale.kupaStatus || '—'}</td>
                    </>
                  )}
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
                  {showInsPremia && !showPensionFinanceCols && (
                    <td>{totalPremia.toLocaleString()}</td>
                  )}
                  {showNeedsCorrectionCol && <td></td>}
                  {showReferrerCol && <td></td>}
                  {showPensionFinanceCols && (
                    <>
                      <td colSpan={2}>{totalPremia.toLocaleString()}</td>
                      <td colSpan={2}>{totalZvira.toLocaleString()}</td>
                      <td colSpan={2}></td>
                    </>
                  )}
                  <td></td>
                </tr>
              )}

              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={totalColumns} style={{ textAlign: 'center', padding: 20, color: '#888' }}>
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
          includeGroupIds={includeGroupIds}
          excludeGroupIds={excludeGroupIds}
          formContext={dealFormContext}
        />
      )}

      {importErrorRows && importErrorRows.length > 0 && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}
          onClick={() => setImportErrorRows(null)}
        >
          <div
            style={{ width: 640, maxWidth: '95vw', maxHeight: '85vh', background: '#F1F5F7', borderRadius: 8, padding: 20, position: 'relative', direction: 'rtl', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setImportErrorRows(null)}
              style={{ position: 'absolute', top: 12, left: 12, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: 'rgba(0,0,0,0.4)' }}
            >
              ✖
            </button>

            <div style={{ fontWeight: 700, color: '#E24B4A', marginBottom: 4 }}>
              שורות שלא נטענו ({importErrorRows.length})
            </div>
            <div style={{ fontSize: 12, color: '#5F5E5A', marginBottom: 12 }}>
              מספר השורה מתייחס למספר השורה בקובץ האקסל המקורי (כולל שורת הכותרות).
            </div>

            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #E8E6DF', borderRadius: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: '#1E5FA8', color: '#fff' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'right', width: 70 }}>שורה</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>סיבה</th>
                  </tr>
                </thead>
                <tbody>
                  {importErrorRows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F5F7FA', borderBottom: '1px solid #E8E6DF' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{r.row}</td>
                      <td style={{ padding: '6px 8px' }}>{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, textAlign: 'left' }}>
              <button type="button" onClick={() => setImportErrorRows(null)} className="sharon-inline-btn" style={{ background: '#5F5E5A' }}>
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportRunsManager && (
        <ImportRunsManager
          agentId={agentId}
          onClose={() => setShowImportRunsManager(false)}
          onDeleted={fetchSales}
        />
      )}

      {toasts.map((t) => (
        <ToastNotification key={t.id} type={t.type} className={t.isHiding ? 'hide' : ''} message={t.message} onClose={() => setToasts((p) => p.filter((x) => x.id !== t.id))} />
      ))}
    </div>
  );
};

export default PensionTab;
