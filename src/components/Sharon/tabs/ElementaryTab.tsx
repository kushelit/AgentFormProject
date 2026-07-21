'use client';
// components/Sharon/tabs/ElementaryTab.tsx

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection, query, where, getDocs,
  addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';
import fetchCustomerBelongToAgent from '@/services/fetchCustomerBelongToAgent';
import ReferrerField from '@/components/ReferrerField/ReferrerField';
import ImportRunsManager from '@/components/ImportRunsManager/ImportRunsManager';
import useFetchMD from '@/hooks/useMD';
import {
  calcElementaryCommission,
  type ElementaryProductGroup,
  type ElementaryProduct,
} from '@/config/elementaryContractsConfig';

// ─── Types ───────────────────────────────────────────────────────────────────

type CustomerResult = {
  id: string;
  IDCustomer: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  phone?: string;
};

type CompanyRow = {
  id: string;
  companyName: string;
  elementaryManual?: boolean;
};

type ContractRate = {
  productId: string;
  track: 'מוזל' | 'רגיל' | '';
  companyName: string;
  commissionRate: string;
};

type ElementaryPolicy = {
  id: string;
  agentId: string;
  customerId: string;
  customerName: string;
  company: string;
  productId: string;
  productLabel: string;
  productGroupId: string;
  track: 'מוזל' | 'רגיל' | '';
  policyNumber: string;
  licenseNumber?: string;
  carModel?: string;
  address?: string;
  startDate: string;
  endDate: string;
  premium: string;
  commissionRate: string;
  commission: string;
  isManual: boolean;
  // ── ייחודי ל-agency4 ──
  statusPolicy?: string;
  notes?: string;
  referrerName?: string;
};

type NewCustomerData = {
  firstNameCustomer: string;
  lastNameCustomer: string;
  phone: string;
  city: string;
  birthday: string;
  gender: 'זכר' | 'נקבה' | '';
};

type EditingRow = Partial<ElementaryPolicy> & {
  isNew?: boolean;
  // customer lookup
  idInput?: string;
  customerFound?: boolean;   // true=קיים, false=לא קיים, undefined=טרם חיפוש
  newCustomer?: NewCustomerData;
};

type Props = {
  agentId: string;
  customer: CustomerResult | null;
  onSelectCustomer: (c: CustomerResult) => void;
  searchQuery: string;
};

// ─── Component ───────────────────────────────────────────────────────────────

const ElementaryTab: React.FC<Props> = ({ agentId, customer, onSelectCustomer }) => {
  const { detail } = useAuth();
  const { statusPolicies } = useFetchMD();
  const { toasts, addToast, setToasts } = useToast();

  // agency4 (נתנאל): בלי שדות עמלה, עם סטטוס/הערות/נציג מפנה
  const canManageAgency4Fields = String(detail?.agencyId ?? '') === '4';

  const [groups, setGroups] = useState<ElementaryProductGroup[]>([]);
  const [products, setProducts] = useState<ElementaryProduct[]>([]);
  const [allCompanies, setAllCompanies] = useState<CompanyRow[]>([]);
  const [contractRates, setContractRates] = useState<ContractRate[]>([]);
  const [policies, setPolicies] = useState<ElementaryPolicy[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditingRow>({});
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterProductId, setFilterProductId] = useState('');
  const [filterReferrer, setFilterReferrer] = useState('');

  // ─── ייבוא מאקסל ────────────────────────────────────────────────────────
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [importErrorRows, setImportErrorRows] = useState<{ row: number; error: string }[] | null>(null);
  const [showImportRunsManager, setShowImportRunsManager] = useState(false);

  const downloadElementaryTemplate = () => {
    if (!agentId) {
      addToast('error', 'יש לבחור סוכן תחילה');
      return;
    }
    const url = `/api/elementary-template/download?agentId=${agentId}`;
    window.open(url, '_blank');
  };

  const handleUploadElementaryExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agentId) {
      addToast('error', 'יש לבחור קובץ ולוודא שסוכן נבחר');
      return;
    }

    setIsUploadingExcel(true);
    setImportErrorRows(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('agentId', agentId);

      const res = await fetch('/api/elementary-template/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        addToast('error', data.error || 'שגיאה בהעלאה');
        if (data.invalidRows?.length > 0) setImportErrorRows(data.invalidRows);
        return;
      }

      const invalidMsg = data.invalidCount > 0 ? ` (${data.invalidCount} שורות נכשלו)` : '';
      addToast('success', `הועלה בהצלחה — ${data.writeCount} פוליסות נשמרו${invalidMsg}`);
      if (data.invalidRows?.length > 0) setImportErrorRows(data.invalidRows);
      await fetchPolicies();
    } catch {
      addToast('error', 'שגיאה בהעלאת הקובץ');
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


  // ─── Fetch meta ───────────────────────────────────────────────────────────
  const fetchMeta = useCallback(async () => {
    const [groupsSnap, productsSnap, companiesSnap] = await Promise.all([
      getDocs(query(collection(db, 'elementaryProductGroups'), orderBy('order'))),
      getDocs(query(collection(db, 'elementaryProducts'), orderBy('order'))),
      getDocs(query(collection(db, 'company'), where('supportsElementary', '==', true))),
    ]);
    setGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ElementaryProductGroup)));
    setProducts(productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ElementaryProduct)));
    setAllCompanies(companiesSnap.docs.map(d => ({
      id: d.id,
      companyName: d.data().companyName,
      elementaryManual: d.data().elementaryManual ?? false,
    })));
  }, []);

  const fetchRates = useCallback(async () => {
    if (!agentId) return;
    const snap = await getDocs(query(
      collection(db, 'elementaryContracts'),
      where('agentId', '==', agentId)
    ));
    setContractRates(snap.docs.map(d => d.data() as ContractRate));
  }, [agentId]);

  const fetchPolicies = useCallback(async () => {
    if (!agentId) return;
    const constraints: any[] = [where('agentId', '==', agentId)];
    if (customer) constraints.push(where('customerId', '==', customer.IDCustomer));
    const snap = await getDocs(query(collection(db, 'elementaryPolicies'), ...constraints));
    setPolicies(snap.docs.map(d => ({ id: d.id, ...d.data() } as ElementaryPolicy)));
  }, [agentId, customer]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchRates(); }, [fetchRates]);
  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  // ─── Customer lookup on ID blur ───────────────────────────────────────────
  const handleIdBlur = async (idValue: string) => {
    if (!idValue || idValue.length < 6 || !agentId) return;
    setIsLookingUp(true);
    try {
      const found = await fetchCustomerBelongToAgent(idValue, agentId);
      if (found) {
        setEditData(prev => ({
          ...prev,
          customerId: found.IDCustomer,
          customerName: `${found.firstNameCustomer} ${found.lastNameCustomer}`,
          customerFound: true,
          newCustomer: undefined,
        }));
      } else {
        setEditData(prev => ({
          ...prev,
          customerId: idValue,
          customerName: '',
          customerFound: false,
          newCustomer: { firstNameCustomer: '', lastNameCustomer: '', phone: '', city: '', birthday: '', gender: '' },
        }));
      }
    } finally {
      setIsLookingUp(false);
    }
  };

  // ─── Commission calc ──────────────────────────────────────────────────────
  // ⚠️ לא רלוונטי ל-agency4 (אין להם שדות עמלה בכלל) — פונקציה זו לא נקראת עבורם
  const calcCommission = (
    company: string, productId: string,
    track: 'מוזל' | 'רגיל' | '', premium: string, manualRate?: string,
  ) => {
    const companyRow = allCompanies.find(c => c.companyName === company);
    const isManual = (companyRow?.elementaryManual ?? false) || productId === 'ktav_sherut';
    const p = parseFloat(premium) || 0;

    if (isManual) {
      const rate = manualRate || '';
      return { rate, commission: rate ? String(Math.round(p * (parseFloat(rate) / 100))) : '', isManual: true };
    }
    const contract = contractRates.find(
      r => r.productId === productId && r.companyName === company && r.track === track
    );
    const rate = contract?.commissionRate || '';
    return { rate, commission: rate ? String(calcElementaryCommission(p, parseFloat(rate))) : '', isManual: false };
  };

  // ─── Edit helpers ─────────────────────────────────────────────────────────
  const startNew = () => {
    const base = {
      company: '', productId: '', productLabel: '', productGroupId: '',
      track: '' as const, policyNumber: '', licenseNumber: '', carModel: '',
      address: '', startDate: '', endDate: '',
      premium: '', commissionRate: '', commission: '', isManual: false,
      statusPolicy: '', notes: '', referrerName: '',
    };

    if (customer) {
      // לקוח נבחר מהחיפוש — ממלאים אוטומטית
      setEditingId('__new__');
      setEditData({
        isNew: true,
        idInput: customer.IDCustomer,
        customerId: customer.IDCustomer,
        customerName: `${customer.firstNameCustomer} ${customer.lastNameCustomer}`,
        customerFound: true,
        ...base,
      });
    } else {
      setEditingId('__new__');
      setEditData({
        isNew: true, idInput: '', customerFound: undefined,
        ...base,
      });
    }
  };

  const startEdit = (policy: ElementaryPolicy) => {
    setEditingId(policy.id);
    setEditData({ ...policy, idInput: policy.customerId, customerFound: true });
  };

  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const handleChange = (field: keyof EditingRow, value: any) => {
    setEditData(prev => {
      const next = { ...prev, [field]: value };

      if (field === 'productId') {
        const found = products.find(p => p.id === value);
        if (found) {
          next.productLabel = found.label;
          next.productGroupId = found.productGroupId;
          if (!found.hasMozalTrack) next.track = '';
        }
      }

      // ⚠️ חישוב עמלה אוטומטי — לא רלוונטי ל-agency4 (אין להם שדות עמלה)
      if (!canManageAgency4Fields && ['company', 'productId', 'track', 'premium', 'commissionRate'].includes(field)) {
        const company = field === 'company' ? value : (prev.company || '');
        const productId = field === 'productId' ? value : (prev.productId || '');
        const track = field === 'track' ? value : (prev.track || '');
        const premium = field === 'premium' ? value : (prev.premium || '');
        const manualRate = field === 'commissionRate' ? value : (prev.commissionRate || '');
        const { rate, commission, isManual } = calcCommission(company, productId, track, premium, manualRate);
        next.commission = commission;
        next.isManual = isManual;
        if (!isManual) next.commissionRate = rate;
      }

      return next;
    });
  };

  // ─── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!agentId) return;
    if (!editData.customerId || editData.customerFound === undefined) {
      addToast('error', 'יש להזין ת"ז לקוח'); return;
    }
    if (!editData.company || !editData.productId || !editData.premium) {
      addToast('error', 'יש למלא: חברה, מוצר, פרמיה'); return;
    }

    try {
      // אם לקוח חדש — יוצרים ב-customer collection קודם
      if (editData.customerFound === false && editData.newCustomer) {
        const nc = editData.newCustomer;
        if (!nc.firstNameCustomer || !nc.lastNameCustomer) {
          addToast('error', 'יש למלא שם פרטי ושם משפחה ללקוח חדש'); return;
        }
        const customerRef = await addDoc(collection(db, 'customer'), {
          AgentId: agentId,
          IDCustomer: editData.customerId,
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

      const customerName = editData.customerFound && editData.customerName
        ? editData.customerName
        : `${editData.newCustomer?.firstNameCustomer || ''} ${editData.newCustomer?.lastNameCustomer || ''}`.trim();

      const payload: Omit<ElementaryPolicy, 'id'> = {
        agentId,
        customerId: editData.customerId || '',
        customerName,
        company: editData.company || '',
        productId: editData.productId || '',
        productLabel: editData.productLabel || '',
        productGroupId: editData.productGroupId || '',
        track: editData.track || '',
        policyNumber: editData.policyNumber || '',
        licenseNumber: editData.licenseNumber || '',
        carModel: editData.carModel || '',
        address: editData.address || '',
        startDate: editData.startDate || '',
        endDate: editData.endDate || '',
        premium: editData.premium || '',
        commissionRate: canManageAgency4Fields ? '' : (editData.commissionRate || ''),
        commission: canManageAgency4Fields ? '' : (editData.commission || ''),
        isManual: canManageAgency4Fields ? false : (editData.isManual || false),
        statusPolicy: canManageAgency4Fields ? (editData.statusPolicy || '') : '',
        notes: canManageAgency4Fields ? (editData.notes || '') : '',
        referrerName: canManageAgency4Fields ? (editData.referrerName || '') : '',
      };

      if (editData.isNew) {
        await addDoc(collection(db, 'elementaryPolicies'), { ...payload, createdAt: serverTimestamp() });
        addToast('success', 'פוליסה נוספה');
      } else {
        await updateDoc(doc(db, 'elementaryPolicies', editingId!), payload as any);
        addToast('success', 'פוליסה עודכנה');
      }
      cancelEdit();
      fetchPolicies();
    } catch {
      addToast('error', 'שגיאה בשמירה');
    }
  };

  const deletePolicy = async (id: string) => {
    if (!confirm('למחוק פוליסה זו?')) return;
    await deleteDoc(doc(db, 'elementaryPolicies', id));
    fetchPolicies();
  };

  // ─── Derived ──────────────────────────────────────────────────────────────
  const filtered = policies.filter(p =>
    (!filterCompany || p.company === filterCompany) &&
    (!filterProductId || p.productId === filterProductId) &&
    (!filterReferrer || p.referrerName === filterReferrer)
  );
  const referrerOptions = [...new Set(policies.map(p => p.referrerName).filter(Boolean))] as string[];
  const totalCommission = filtered.reduce((s, p) => s + (parseFloat(p.commission) || 0), 0);
  const currentProduct = products.find(p => p.id === editData.productId);
  const isCarGroup = currentProduct?.productGroupId === 'car';
  const isHomeGroup = currentProduct?.productGroupId === 'home';
  const isBusinessGroup = currentProduct?.productGroupId === 'business';
  const hasMozalTrack = currentProduct?.hasMozalTrack ?? false;
  const editIsManual =
    (allCompanies.find(c => c.companyName === editData.company)?.elementaryManual ?? false)
    || editData.productId === 'ktav_sherut';

  // תצוגת תאריך DD/MM/YYYY (סדר קריאה טבעי בעברית) — הערך הפנימי נשאר YYYY-MM-DD
  const formatDateDisplay = (iso?: string) => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  // מספר העמודות בפועל בטבלה — לחישוב colSpan דינמי
  // קבועות: לקוח/ת"ז(colSpan=2) + חברה + מוצר + מס' פוליסה + רישוי/כתובת + תחילה + סיום + פרמיה = 9
  // + מסלול (רק לא-agency4) = 10/9
  const fixedColumns = 9 + (canManageAgency4Fields ? 0 : 1);
  const totalColumns = fixedColumns + (canManageAgency4Fields ? 3 : 2) + 1; // +1 = עמודת פעולות

  // ─── Customer input block (used in new row) ───────────────────────────────
  const renderCustomerInput = () => (
    <td colSpan={2}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* ת"ז */}
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

        {/* לקוח קיים */}
        {editData.customerFound === true && (
          <div style={{ fontSize: 11, color: '#185FA5', fontWeight: 500 }}>
            ✓ {editData.customerName}
          </div>
        )}

        {/* לקוח חדש */}
        {editData.customerFound === false && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, border: '1px solid #FAEEDA', borderRadius: 4, padding: 6, background: '#FFFDF7' }}>
            <div style={{ fontSize: 11, color: '#854F0B', marginBottom: 2 }}>⚠️ לקוח חדש — יש להשלים פרטים</div>
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
  const renderEditCells = () => (
    <>
      {renderCustomerInput()}
      <td>
        <select className="sharon-inline-select" value={editData.company || ''} onChange={e => handleChange('company', e.target.value)}>
          <option value="">בחר חברה</option>
          {allCompanies.map(c => <option key={c.id} value={c.companyName}>{c.companyName}</option>)}
        </select>
      </td>
      <td>
        <select className="sharon-inline-select" value={editData.productId || ''} onChange={e => handleChange('productId', e.target.value)}>
          <option value="">בחר מוצר</option>
          {groups.map(g => (
            <optgroup key={g.id} label={g.label}>
              {products.filter(p => p.productGroupId === g.id).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </td>
      {!canManageAgency4Fields && (
        <td>
          {hasMozalTrack ? (
            <select className="sharon-inline-select" value={editData.track || ''} onChange={e => handleChange('track', e.target.value)}>
              <option value="">—</option>
              <option value="מוזל">מוזל</option>
              <option value="רגיל">רגיל</option>
            </select>
          ) : <span style={{ color: '#888', fontSize: 11 }}>—</span>}
        </td>
      )}
      <td><input className="sharon-inline-input" value={editData.policyNumber || ''} onChange={e => handleChange('policyNumber', e.target.value)} placeholder="מס׳ פוליסה" /></td>
      <td>
        {isCarGroup ? (
          <input className="sharon-inline-input" value={editData.licenseNumber || ''} onChange={e => handleChange('licenseNumber', e.target.value)} placeholder="רישוי" />
        ) : (isHomeGroup || isBusinessGroup) ? (
          <input className="sharon-inline-input" value={editData.address || ''} onChange={e => handleChange('address', e.target.value)} placeholder="כתובת" />
        ) : <span>—</span>}
      </td>
      <td><input className="sharon-inline-input" type="date" value={editData.startDate || ''} onChange={e => handleChange('startDate', e.target.value)} /></td>
      <td><input className="sharon-inline-input" type="date" value={editData.endDate || ''} onChange={e => handleChange('endDate', e.target.value)} /></td>
      <td><input className="sharon-inline-input" type="number" value={editData.premium || ''} onChange={e => handleChange('premium', e.target.value)} placeholder="₪" style={{ width: 70 }} /></td>

      {!canManageAgency4Fields && (
        <>
          <td>
            {editIsManual
              ? <input className="sharon-inline-input" type="number" value={editData.commissionRate || ''} onChange={e => handleChange('commissionRate', e.target.value)} placeholder="%" style={{ width: 50 }} />
              : <span style={{ fontSize: 11, color: '#5F5E5A' }}>{editData.commissionRate ? `${editData.commissionRate}%` : '—'}</span>}
          </td>
          <td className="commission-cell">{editData.commission ? `${parseFloat(editData.commission).toLocaleString()} ₪` : '—'}</td>
        </>
      )}

      {canManageAgency4Fields && (
        <>
          <td>
            <select className="sharon-inline-select" value={editData.statusPolicy || ''} onChange={e => handleChange('statusPolicy', e.target.value)}>
              <option value="">בחר סטטוס</option>
              {statusPolicies.map((s, i) => <option key={i} value={s}>{s}</option>)}
            </select>
          </td>
          <td><input className="sharon-inline-input" value={editData.notes || ''} onChange={e => handleChange('notes', e.target.value)} placeholder="הערות" /></td>
          <td>
            <ReferrerField
              agentId={agentId}
              value={editData.referrerName || ''}
              onChange={(v) => handleChange('referrerName', v)}
              selectClassName="sharon-inline-select"
            />
          </td>
        </>
      )}

      <td style={{ display: 'flex', gap: 4 }}>
        <button className="sharon-inline-btn" onClick={save}>שמור</button>
        <button className="sharon-inline-btn" style={{ background: '#888' }} onClick={cancelEdit}>בטל</button>
      </td>
    </>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {editingId !== '__new__' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '8px 16px 0' }}>
          <button
            type="button"
            onClick={downloadElementaryTemplate}
            className="sharon-inline-btn"
            style={{ background: '#5F5E5A' }}
          >
            הורד תבנית אקסל
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={handleUploadElementaryExcel}
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
          <div className="sharon-add-row" onClick={startNew}>
            + הוסף פוליסה{customer ? ` ל${customer.firstNameCustomer} ${customer.lastNameCustomer}` : ''}
          </div>
        </div>
      )}

      <div className="sharon-filter-row">
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="">כל החברות</option>
          {allCompanies.map(c => <option key={c.id} value={c.companyName}>{c.companyName}</option>)}
        </select>
        <select value={filterProductId} onChange={e => setFilterProductId(e.target.value)}>
          <option value="">כל המוצרים</option>
          {groups.map(g => (
            <optgroup key={g.id} label={g.label}>
              {products.filter(p => p.productGroupId === g.id).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {canManageAgency4Fields && (
          <select value={filterReferrer} onChange={e => setFilterReferrer(e.target.value)}>
            <option value="">כל הנציגים המפנים</option>
            {referrerOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      <div className="sharon-table-wrap">
        <table className="sharon-table">
          <thead>
            <tr>
             <th colSpan={2}>לקוח / ת&quot;ז</th>
              <th>חברה</th>
              <th>מוצר</th>
              {!canManageAgency4Fields && <th>מסלול</th>}
              <th>מס׳ פוליסה</th>
              <th>רישוי / כתובת</th>
              <th>תחילה</th>
              <th>סיום</th>
              <th>פרמיה</th>
              {!canManageAgency4Fields && (
                <>
                  <th>% עמלה</th>
                  <th>עמלה (₪)</th>
                </>
              )}
              {canManageAgency4Fields && (
                <>
                  <th>סטטוס</th>
                  <th>הערות</th>
                  <th>נציג מפנה</th>
                </>
              )}
              <th></th>
            </tr>
          </thead>
          <tbody>
          {filtered.map(policy => (
  <tr
    key={policy.id}
    onClick={() => { if (editingId !== policy.id) handleRowSelectCustomer(policy.customerId); }}
    style={{ cursor: editingId === policy.id ? 'default' : 'pointer' }}
  >
    {editingId === policy.id ? renderEditCells() : (
                  <>
                    <td colSpan={2}>
                      <div style={{ fontWeight: 500 }}>{policy.customerName}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{policy.customerId}</div>
                    </td>
                    <td>{policy.company}</td>
                    <td>{policy.productLabel}</td>
                    {!canManageAgency4Fields && <td>{policy.track || '—'}</td>}
                    <td>{policy.policyNumber}</td>
                    <td>{policy.licenseNumber || policy.address || '—'}</td>
                    <td>{formatDateDisplay(policy.startDate)}</td>
                    <td>{formatDateDisplay(policy.endDate)}</td>
                    <td>{policy.premium ? parseFloat(policy.premium).toLocaleString() : '—'}</td>
                    {!canManageAgency4Fields && (
                      <>
                        <td>{policy.commissionRate ? `${policy.commissionRate}%` : '—'}</td>
                        <td className="commission-cell">{policy.commission ? `${parseFloat(policy.commission).toLocaleString()} ₪` : '—'}</td>
                      </>
                    )}
                    {canManageAgency4Fields && (
                      <>
                        <td>{policy.statusPolicy || '—'}</td>
                        <td>{policy.notes || '—'}</td>
                        <td>{policy.referrerName || '—'}</td>
                      </>
                    )}
                    <td style={{ display: 'flex', gap: 4 }}>
                      <button className="sharon-inline-btn" style={{ background: '#5F5E5A' }} onClick={() => startEdit(policy)}>✏️</button>
                      <button className="sharon-inline-btn" style={{ background: '#E24B4A' }} onClick={() => deletePolicy(policy.id)}>🗑</button>
                    </td>
                  </>
                )}
              </tr>
            ))}

            {editingId === '__new__' && (
              <tr style={{ background: '#F0F7FF' }}>
                {renderEditCells()}
              </tr>
            )}

            {filtered.length > 0 && (
              <tr className="sum-row">
                {!canManageAgency4Fields && (
                  <>
<td colSpan={fixedColumns + 1} style={{ fontSize: 12, color: '#5F5E5A' }}>
  סה&quot;כ — {filtered.length} פוליסות
</td>
                    <td className="commission-cell">{totalCommission.toLocaleString()} ₪</td>
                  </>
                )}
                {canManageAgency4Fields && (
<td colSpan={fixedColumns + 3} style={{ fontSize: 12, color: '#5F5E5A' }}>
  סה&quot;כ — {filtered.length} פוליסות
</td>
                )}
                <td></td>
              </tr>
            )}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={totalColumns} style={{ textAlign: 'center', padding: 20, color: '#888' }}>
                  אין פוליסות אלמנטרי {customer ? 'ללקוח זה' : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* הבהרה על חברות ידניות — רלוונטית רק כשיש בכלל שדות עמלה (לא agency4) */}
      {!canManageAgency4Fields && allCompanies.some(c => c.elementaryManual) && (
        <div style={{ padding: '0 16px', marginTop: 8 }}>
          <div style={{ fontSize: 12, color: '#5F5E5A' }}>
            חברות ידניות מסומנות באחוז עמלה שמוזן ידנית בכל פוליסה.
          </div>
        </div>
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
              <button
                type="button"
                onClick={() => setImportErrorRows(null)}
                className="sharon-inline-btn"
                style={{ background: '#5F5E5A' }}
              >
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
          onDeleted={fetchPolicies}
        />
      )}

      {toasts.map(t => (
        <ToastNotification key={t.id} type={t.type} className={t.isHiding ? 'hide' : ''} message={t.message} onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
      ))}
    </div>
  );
};

export default ElementaryTab;
