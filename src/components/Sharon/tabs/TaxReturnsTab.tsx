'use client';
// components/Sharon/tabs/TaxReturnsTab.tsx

import React, { useCallback, useEffect, useState } from 'react';
import {
  collection, query, where, getDocs,
  addDoc, doc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';
import fetchCustomerBelongToAgent from '@/services/fetchCustomerBelongToAgent';

// ─── Types ───────────────────────────────────────────────────────────────────

type CustomerResult = {
  id: string;
  IDCustomer: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  phone?: string;
};

type TaxStatus =
  | 'חדש'
  | 'ממתין למסמכים'
  | 'לא זכאי/ת להחזר'
  | 'ממתין להחזרים'
  | 'קוד ביטוח לאומי';

const TAX_STATUSES: TaxStatus[] = [
  'חדש', 'ממתין למסמכים', 'לא זכאי/ת להחזר', 'ממתין להחזרים', 'קוד ביטוח לאומי',
];

// 3 אפשרויות הסכם בלבד
type CommissionRate = '5' | '10' | '15';
const COMMISSION_RATES: CommissionRate[] = ['5', '10', '15'];

type TaxReturnClient = {
  id: string;
  agentId: string;
  customerId: string;
  fullName: string;
  idNumber: string;
  city: string;
  phone: string;
  startDate: string;
  status: TaxStatus | '';
  documents: string;
  expectedRefund: string;
  commissionRate: CommissionRate | '';  // 5 / 10 / 15
  accountantCommission: string;         // מחושב
  sharonCommission: string;             // מחושב
  paymentStatus: 'שולם' | 'טרם שולם' | '';
};

type NewCustomerData = {
  firstNameCustomer: string;
  lastNameCustomer: string;
  phone: string;
  city: string;
  birthday: string;
  gender: 'זכר' | 'נקבה' | '';
};

type EditingRow = Partial<TaxReturnClient> & {
  isNew?: boolean;
  idInput?: string;
  customerFound?: boolean;
  newCustomer?: NewCustomerData;
};

type Props = {
  agentId: string;
  customer: CustomerResult | null;
  onSelectCustomer: (c: CustomerResult) => void;
  searchQuery: string;
};

// ─── Commission calc ──────────────────────────────────────────────────────────
// בסיס = צפי החזר × 1.18 (כולל מע"מ)
// 5%  → כל העמלה לרו"ח:  רו"ח = בסיס × 5%,    שרון = 0
// 10% → חצי חצי:         רו"ח = בסיס × 5%,    שרון = בסיס × 5%
// 15% → חצי חצי:         רו"ח = בסיס × 7.5%,  שרון = בסיס × 7.5%

const VAT = 1.18;

function calcTaxCommissions(
  expectedRefund: string,
  commissionRate: CommissionRate | '',
): { accountant: string; sharon: string; base: string } {
  const refund = parseFloat(expectedRefund) || 0;
  if (!refund || !commissionRate) return { accountant: '', sharon: '', base: '' };

  const base = refund * VAT;

  let accountantPct = 0;
  let sharonPct = 0;

  if (commissionRate === '5') {
    accountantPct = 5;
    sharonPct = 0;
  } else if (commissionRate === '10') {
    accountantPct = 5;
    sharonPct = 5;
  } else if (commissionRate === '15') {
    accountantPct = 7.5;
    sharonPct = 7.5;
  }

  return {
    base: String(Math.round(base)),
    accountant: String(Math.round(base * accountantPct / 100)),
    sharon: String(Math.round(base * sharonPct / 100)),
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

const TaxReturnsTab: React.FC<Props> = ({ agentId, customer }) => {
  const { toasts, addToast, setToasts } = useToast();

  const [clients, setClients] = useState<TaxReturnClient[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditingRow>({});
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPayment, setFilterPayment] = useState('');

  const fetchClients = useCallback(async () => {
    if (!agentId) return;
    const constraints: any[] = [where('agentId', '==', agentId)];
    if (customer) constraints.push(where('customerId', '==', customer.IDCustomer));
    const snap = await getDocs(query(collection(db, 'taxReturnClients'), ...constraints));
    setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaxReturnClient)));
  }, [agentId, customer]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // ─── Customer lookup ──────────────────────────────────────────────────────
  const handleIdBlur = async (idValue: string) => {
    if (!idValue || idValue.length < 6 || !agentId) return;
    setIsLookingUp(true);
    try {
      const found = await fetchCustomerBelongToAgent(idValue, agentId);
      if (found) {
        setEditData(prev => ({
          ...prev,
          customerId: found.IDCustomer,
          idNumber: found.IDCustomer,
          fullName: `${found.firstNameCustomer} ${found.lastNameCustomer}`,
          phone: found.phone || prev.phone || '',
          customerFound: true,
          newCustomer: undefined,
        }));
      } else {
        setEditData(prev => ({
          ...prev,
          customerId: idValue,
          idNumber: idValue,
          fullName: '',
          customerFound: false,
          newCustomer: { firstNameCustomer: '', lastNameCustomer: '', phone: '', city: '', birthday: '', gender: '' },
        }));
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  // ─── Edit helpers ─────────────────────────────────────────────────────────
  const emptyEdit = (): EditingRow => ({
    isNew: true,
    city: '', startDate: '', status: 'חדש', documents: '',
    expectedRefund: '', commissionRate: '',
    accountantCommission: '', sharonCommission: '', paymentStatus: 'טרם שולם',
  });

  const startNew = () => {
    setEditingId('__new__');
    if (customer) {
      setEditData({
        ...emptyEdit(),
        idInput: customer.IDCustomer,
        customerId: customer.IDCustomer,
        idNumber: customer.IDCustomer,
        fullName: `${customer.firstNameCustomer} ${customer.lastNameCustomer}`,
        phone: customer.phone || '',
        customerFound: true,
      });
    } else {
      setEditData({ ...emptyEdit(), idInput: '', customerFound: undefined });
    }
  };

  const startEdit = (client: TaxReturnClient) => {
    setEditingId(client.id);
    setEditData({ ...client, idInput: client.idNumber, customerFound: true });
  };

  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const handleChange = (field: keyof EditingRow, value: any) => {
    setEditData(prev => {
      const next = { ...prev, [field]: value };
      // recalc on relevant changes
      if (field === 'expectedRefund' || field === 'commissionRate') {
        const refund = field === 'expectedRefund' ? value : (prev.expectedRefund || '');
        const rate = field === 'commissionRate' ? value : (prev.commissionRate || '');
        const { accountant, sharon } = calcTaxCommissions(refund, rate as CommissionRate);
        next.accountantCommission = accountant;
        next.sharonCommission = sharon;
      }
      return next;
    });
  };

  // ─── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!agentId) return;
    if (!editData.idNumber || editData.customerFound === undefined) {
      addToast('error', 'יש להזין ת"ז לקוח'); return;
    }

    try {
      if (editData.customerFound === false && editData.newCustomer) {
        const nc = editData.newCustomer;
        if (!nc.firstNameCustomer || !nc.lastNameCustomer) {
          addToast('error', 'יש למלא שם פרטי ושם משפחה'); return;
        }
        const customerRef = await addDoc(collection(db, 'customer'), {
          AgentId: agentId,
          IDCustomer: editData.idNumber,
          firstNameCustomer: nc.firstNameCustomer,
          lastNameCustomer: nc.lastNameCustomer,
          phone: nc.phone || '',
          address: nc.city || '',
          birthday: nc.birthday || '',
          gender: nc.gender || '',
          createdAt: serverTimestamp(),
        });
        await updateDoc(customerRef, { parentID: customerRef.id });
      }

      const fullName = editData.customerFound
        ? (editData.fullName || '')
        : `${editData.newCustomer?.firstNameCustomer || ''} ${editData.newCustomer?.lastNameCustomer || ''}`.trim();

      const payload: Omit<TaxReturnClient, 'id'> = {
        agentId,
        customerId: editData.idNumber || '',
        fullName,
        idNumber: editData.idNumber || '',
        city: editData.city || editData.newCustomer?.city || '',
        phone: editData.phone || editData.newCustomer?.phone || '',
        startDate: editData.startDate || '',
        status: editData.status || '',
        documents: editData.documents || '',
        expectedRefund: editData.expectedRefund || '',
        commissionRate: editData.commissionRate || '',
        accountantCommission: editData.accountantCommission || '',
        sharonCommission: editData.sharonCommission || '',
        paymentStatus: editData.paymentStatus || '',
      };

      if (editData.isNew) {
        await addDoc(collection(db, 'taxReturnClients'), { ...payload, createdAt: serverTimestamp() });
        addToast('success', 'תיק נוסף');
      } else {
        await updateDoc(doc(db, 'taxReturnClients', editingId!), payload as any);
        addToast('success', 'תיק עודכן');
      }
      cancelEdit();
      fetchClients();
    } catch {
      addToast('error', 'שגיאה בשמירה');
    }
  };

  const deleteClient = async (id: string) => {
    if (!confirm('למחוק תיק זה?')) return;
    await deleteDoc(doc(db, 'taxReturnClients', id));
    fetchClients();
  };

  // ─── Filters ──────────────────────────────────────────────────────────────
  const filtered = clients.filter(c =>
    (!filterStatus || c.status === filterStatus) &&
    (!filterPayment || c.paymentStatus === filterPayment)
  );
  const totalSharon = filtered.reduce((s, c) => s + (parseFloat(c.sharonCommission) || 0), 0);
  const totalAccountant = filtered.reduce((s, c) => s + (parseFloat(c.accountantCommission) || 0), 0);

  // ─── Customer input block ─────────────────────────────────────────────────
  const renderCustomerInput = () => (
    <td>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
         <input
  className="sharon-inline-input"
  placeholder='ת"ז'
  value={editData.idInput || ''}
  style={{ width: 90, borderColor: editData.idInput && editData.idInput.length > 0 && editData.idInput.length < 6 ? '#E24B4A' : undefined }}
  onChange={e => setEditData(prev => ({ ...prev, idInput: e.target.value, customerFound: undefined }))}
  onBlur={e => handleIdBlur(e.target.value)}
/>
{editData.idInput && editData.idInput.length > 0 && editData.idInput.length < 6 && (
  <div style={{ fontSize: 10, color: '#E24B4A', marginTop: 2 }}>מינימום 6 ספרות</div>
)}
{isLookingUp && <span style={{ fontSize: 11, color: '#888' }}>מחפש...</span>}
        </div>
        {editData.customerFound === true && (
          <div style={{ fontSize: 11, color: '#185FA5', fontWeight: 500 }}>✓ {editData.fullName}</div>
        )}
        {editData.customerFound === false && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, border: '1px solid #FAEEDA', borderRadius: 4, padding: 6, background: '#FFFDF7' }}>
            <div style={{ fontSize: 11, color: '#854F0B', marginBottom: 2 }}>⚠️ לקוח חדש</div>
            <input className="sharon-inline-input" placeholder="שם פרטי *"
              value={editData.newCustomer?.firstNameCustomer || ''}
              onChange={e => setEditData(prev => ({ ...prev, newCustomer: { ...prev.newCustomer!, firstNameCustomer: e.target.value } }))} />
            <input className="sharon-inline-input" placeholder="שם משפחה *"
              value={editData.newCustomer?.lastNameCustomer || ''}
              onChange={e => setEditData(prev => ({ ...prev, newCustomer: { ...prev.newCustomer!, lastNameCustomer: e.target.value } }))} />
            <input className="sharon-inline-input" placeholder="טלפון"
              value={editData.newCustomer?.phone || ''}
              onChange={e => setEditData(prev => ({ ...prev, newCustomer: { ...prev.newCustomer!, phone: e.target.value } }))} />
            <input className="sharon-inline-input" placeholder="עיר"
              value={editData.newCustomer?.city || ''}
              onChange={e => setEditData(prev => ({ ...prev, newCustomer: { ...prev.newCustomer!, city: e.target.value } }))} />
            <input className="sharon-inline-input" placeholder="תאריך לידה" type="date"
              value={editData.newCustomer?.birthday || ''}
              onChange={e => setEditData(prev => ({ ...prev, newCustomer: { ...prev.newCustomer!, birthday: e.target.value } }))} />
            <select className="sharon-inline-select"
              value={editData.newCustomer?.gender || ''}
              onChange={e => setEditData(prev => ({ ...prev, newCustomer: { ...prev.newCustomer!, gender: e.target.value as any } }))}>
              <option value="">מגדר</option>
              <option value="זכר">זכר</option>
              <option value="נקבה">נקבה</option>
            </select>
          </div>
        )}
      </div>
    </td>
  );

  // ─── Edit cells ───────────────────────────────────────────────────────────
  const renderEditCells = () => {
    const { base } = calcTaxCommissions(editData.expectedRefund || '', editData.commissionRate as CommissionRate || '');
    return (
      <>
        <td><input className="sharon-inline-input" value={editData.startDate || ''} type="date" onChange={e => handleChange('startDate', e.target.value)} /></td>
        {renderCustomerInput()}
        <td><input className="sharon-inline-input" value={editData.city || ''} onChange={e => handleChange('city', e.target.value)} placeholder="יישוב" /></td>
        <td><input className="sharon-inline-input" value={editData.phone || ''} onChange={e => handleChange('phone', e.target.value)} placeholder="טלפון" /></td>
        <td>
          <select className="sharon-inline-select" value={editData.status || ''} onChange={e => handleChange('status', e.target.value)}>
            <option value="">בחר סטטוס</option>
            {TAX_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
<td>
  <textarea
    className="sharon-inline-input"
    value={editData.documents || ''}
    onChange={e => handleChange('documents', e.target.value)}
    placeholder="הערות"
    rows={3}
    style={{ resize: 'vertical', minHeight: 60, width: '100%' }}
  />
</td>
        <td><input className="sharon-inline-input" type="number" value={editData.expectedRefund || ''} onChange={e => handleChange('expectedRefund', e.target.value)} placeholder="₪" style={{ width: 80 }} /></td>
        <td>
          <select className="sharon-inline-select" value={editData.commissionRate || ''} onChange={e => handleChange('commissionRate', e.target.value)} style={{ width: 60 }}>
            <option value="">%</option>
            {COMMISSION_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
          </select>
          {base && <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>בסיס: {parseFloat(base).toLocaleString()} ₪</div>}
        </td>
        <td style={{ fontSize: 11, color: '#5F5E5A' }}>{editData.accountantCommission ? `${parseFloat(editData.accountantCommission).toLocaleString()} ₪` : '—'}</td>
        <td className="commission-cell">{editData.sharonCommission ? `${parseFloat(editData.sharonCommission).toLocaleString()} ₪` : '—'}</td>
        <td>
          <select className="sharon-inline-select" value={editData.paymentStatus || ''} onChange={e => handleChange('paymentStatus', e.target.value)}>
            <option value="">בחר</option>
            <option value="שולם">שולם</option>
            <option value="טרם שולם">טרם שולם</option>
          </select>
        </td>
        <td style={{ display: 'flex', gap: 4 }}>
          <button className="sharon-inline-btn" onClick={save}>שמור</button>
          <button className="sharon-inline-btn" style={{ background: '#888' }} onClick={cancelEdit}>בטל</button>
        </td>
      </>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="sharon-filter-row">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">כל הסטטוסים</option>
          {TAX_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
          <option value="">כל סטטוסי תשלום</option>
          <option value="שולם">שולם</option>
          <option value="טרם שולם">טרם שולם</option>
        </select>
      </div>

      <div className="sharon-table-wrap">
        <table className="sharon-table">
          <thead>
            <tr>
              <th>תאריך פתיחה</th>
             <th>לקוח / ת&quot;ז</th>
              <th>יישוב</th>
              <th>טלפון</th>
              <th>סטטוס</th>
              <th>הערות</th>
              <th>צפי החזר</th>
              <th>% הסכם</th>
             <th>עמלת רו&quot;ח</th>
              <th>עמלת שרון</th>
              <th>תשלום</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(client => (
              <tr key={client.id}>
                {editingId === client.id ? renderEditCells() : (
                  <>
                    <td>{client.startDate || '—'}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{client.fullName}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{client.idNumber}</div>
                    </td>
                    <td>{client.city || '—'}</td>
                    <td>{client.phone || '—'}</td>
                    <td>
                      <span className={`sharon-pill ${
                        client.status === 'ממתין להחזרים' ? 'sharon-pill-amber' :
                        client.status === 'חדש' ? 'sharon-pill-blue' :
                        client.status === 'לא זכאי/ת להחזר' ? 'sharon-pill-gray' :
                        'sharon-pill-green'
                      }`}>{client.status || '—'}</span>
                    </td>
                  <td style={{ whiteSpace: 'pre-wrap', maxWidth: 180, fontSize: 12 }}>{client.documents || '—'}</td>
                    <td>{client.expectedRefund ? `${parseFloat(client.expectedRefund).toLocaleString()} ₪` : '—'}</td>
                    <td>{client.commissionRate ? `${client.commissionRate}%` : '—'}</td>
                    <td style={{ fontSize: 11, color: '#5F5E5A' }}>{client.accountantCommission ? `${parseFloat(client.accountantCommission).toLocaleString()} ₪` : '—'}</td>
                    <td className="commission-cell">{client.sharonCommission ? `${parseFloat(client.sharonCommission).toLocaleString()} ₪` : '—'}</td>
                    <td>
                      <span className={`sharon-pill ${client.paymentStatus === 'שולם' ? 'sharon-pill-green' : 'sharon-pill-gray'}`}>
                        {client.paymentStatus || '—'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      <button className="sharon-inline-btn" style={{ background: '#5F5E5A' }} onClick={() => startEdit(client)}>✏️</button>
                      <button className="sharon-inline-btn" style={{ background: '#E24B4A' }} onClick={() => deleteClient(client.id)}>🗑</button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {editingId === '__new__' && (
              <tr style={{ background: '#F0F7FF' }}>{renderEditCells()}</tr>
            )}

            {filtered.length > 0 && (
              <tr className="sum-row">
<td colSpan={8} style={{ fontSize: 12, color: '#5F5E5A' }}>
  סה&quot;כ — {filtered.length} תיקים
</td>
                <td style={{ fontSize: 11, color: '#5F5E5A' }}>{totalAccountant.toLocaleString()} ₪</td>
                <td className="commission-cell">{totalSharon.toLocaleString()} ₪</td>
                <td colSpan={2}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId !== '__new__' && (
        <div className="sharon-add-row" onClick={startNew}>
          + הוסף תיק החזר מס{customer ? ` ל${customer.firstNameCustomer} ${customer.lastNameCustomer}` : ''}
        </div>
      )}

      {toasts.map(t => (
        <ToastNotification key={t.id} type={t.type} className={t.isHiding ? 'hide' : ''} message={t.message} onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
      ))}
    </div>
  );
};

export default TaxReturnsTab;
