'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  collection, doc, getDoc, getDocs, query, where, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchMD from '@/hooks/useMD';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { usePermission } from '@/hooks/usePermission';
import { fetchExternalForCustomers } from '@/services/externalQueries';
import { Button } from '@/components/Button/Button';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';
import './CustomerPage.css';
import CustomerNotes from './CustomerNotes';
import CustomerTasks from './CustomerTasks';

// ─── טיפוסים ──────────────────────────────────────────────────────────────────

interface CustomerDoc {
  id: string;
  IDCustomer: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  fullNameCustomer?: string;
  birthday?: string;
  gender?: string;
  phone?: string;
  mail?: string;
  address?: string;
  sourceValue?: string;
  sourceLead?: string;
  notes?: string;
  parentID?: string;
  parentFullName?: string;
  AgentId: string;
}

interface SaleRow {
  _id: string;
  IDCustomer: string;
  product: string;
  company: string;
  mounth?: string;
  month?: string;
  statusPolicy?: string;
  insPremia?: string;
  pensiaPremia?: string;
  pensiaZvira?: string;
  finansimPremia?: string;
  finansimZvira?: string;
  minuySochen?: boolean;
  commissionHekef?: number;
  commissionNifraim?: number;
  sumPremia?: number;
  sumTzvira?: number;
}

interface ExternalRow {
  company: string;
  product?: string;
  policyNumber?: string;
  commissionAmount: number;
  reportMonth?: string;
}

interface FamilyMember {
  id: string;
  IDCustomer: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  parentID?: string;
}

type TabKey = 'magic' | 'nifraim' | 'gaps' | 'family' | 'notes' | 'tasks';

// ─── עזרים ────────────────────────────────────────────────────────────────────

const normIdDigits = (v: any) => String(v ?? '').trim().replace(/\D/g, '');
const pad9 = (v: string) => v.padStart(9, '0');
const stripZeros = (v: string) => v.replace(/^0+/, '');
const canonId = (v: any) => stripZeros(normIdDigits(v));

const idVariants = (v: any): string[] => {
  const d = normIdDigits(v);
  if (!d) return [];
  return Array.from(new Set([d, pad9(d), stripZeros(d)].filter(Boolean)));
};

const saleKey = (s: any) =>
  [
    String(s.company ?? '').trim(),
    String(s.product ?? '').trim(),
    String((s.mounth || s.month || '')).slice(0, 7),
    canonId(s.IDCustomer),
    String((s.policyNumber || s._id || '')).trim(),
  ].join('|');

const dedupeSales = (rows: any[]) => {
  const m = new Map<string, any>();
  for (const r of rows) {
    const k = saleKey(r);
    if (!m.has(k)) m.set(k, r);
  }
  return Array.from(m.values());
};

const prevMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const initials = (first: string, last: string) =>
  `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();

// ─── קומפוננט ראשי ────────────────────────────────────────────────────────────

export default function CustomerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, detail } = useAuth();
  const { formatIsraeliDateOnly, sourceLeadMap, fetchSourceLeadMap } = useFetchMD();
  const { toasts, addToast, setToasts } = useToast();
  const { canAccess: canAccessCrm } = usePermission('access_crm_module');
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const { canAccess: canViewCommissions } = usePermission('view_commissions_field');
  const { canAccess: canSeeExternal } = usePermission('access_commission_import');

  // ─── מזהה לקוח מה-URL ────────────────────────────────────────────────────────
  // params.id = מזהה מסמך Firestore של הלקוח
  const customerId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');

  // ─── סטייט ───────────────────────────────────────────────────────────────────
  const [customer, setCustomer] = useState<CustomerDoc | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(true);

  const [activeTab, setActiveTab] = useState<TabKey>('magic');

  // עריכת פרטי לקוח
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<CustomerDoc>>({});
  const [isSaving, setIsSaving] = useState(false);

  const startEdit = () => {
    if (!customer) return;
    setEditData({
      firstNameCustomer: customer.firstNameCustomer,
      lastNameCustomer: customer.lastNameCustomer,
      IDCustomer: customer.IDCustomer,
      birthday: customer.birthday ?? '',
      gender: customer.gender ?? '',
      phone: customer.phone ?? '',
      mail: customer.mail ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
    });
    setIsEditing(true);
  };

  const cancelEdit = () => { setIsEditing(false); setEditData({}); };

  const saveEdit = async () => {
    if (!customer) return;
    setIsSaving(true);
    try {
      const fullName = (editData.firstNameCustomer ?? '') + ' ' + (editData.lastNameCustomer ?? '');
      await updateDoc(doc(db, 'customer', customer.id), {
        ...editData,
        fullNameCustomer: fullName.trim(),
        lastUpdateDate: serverTimestamp(),
      });
      setCustomer(prev => prev ? { ...prev, ...editData, fullNameCustomer: fullName.trim() } : prev);
      setIsEditing(false);
      setEditData({});
      addToast('success', 'פרטי הלקוח עודכנו בהצלחה');
    } catch {
      addToast('error', 'כשל בשמירת הנתונים');
    } finally {
      setIsSaving(false);
    }
  };

  // עסקאות Magic
  const [magicSales, setMagicSales] = useState<SaleRow[]>([]);
  const [loadingMagic, setLoadingMagic] = useState(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [productMap, setProductMap] = useState<Record<string, any>>({});

  // נפרעים מקלטות
  const [reportMonth, setReportMonth] = useState(prevMonth);
  const [externalRows, setExternalRows] = useState<ExternalRow[]>([]);
  const [loadingExternal, setLoadingExternal] = useState(false);

  // פערים
  const [magicNifraim, setMagicNifraim] = useState(0);
  const [externalTotal, setExternalTotal] = useState(0);

  // קשרים משפחתיים
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loadingFamily, setLoadingFamily] = useState(false);

  // ─── טעינת נתוני לקוח ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!customerId) return;
    const load = async () => {
      setLoadingCustomer(true);
      try {
        const snap = await getDoc(doc(db, 'customer', customerId));
        if (snap.exists()) {
          setCustomer({ id: snap.id, ...(snap.data() as Omit<CustomerDoc, 'id'>) });
        }
      } finally {
        setLoadingCustomer(false);
      }
    };
    load();
  }, [customerId]);

  // ─── טעינת חוזים ומוצרים (חד-פעמי) ─────────────────────────────────────────
  useEffect(() => {
    const fetchContracts = async () => {
      const snap = await getDocs(collection(db, 'contracts'));
      setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    const fetchProducts = async () => {
      const snap = await getDocs(collection(db, 'product'));
      const map: Record<string, any> = {};
      snap.docs.forEach(d => {
        const pd = d.data() as any;
        map[pd.productName] = pd;
      });
      setProductMap(map);
    };
    fetchContracts();
    fetchProducts();
  }, []);

  // ─── sourceLeadMap ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (customer?.AgentId) fetchSourceLeadMap(customer.AgentId);
  }, [customer?.AgentId]);

  // ─── חישוב עמלות (מהלוגיקה הקיימת) ─────────────────────────────────────────
const calculateCommissions = (sale: any, contractMatch: any) => {
  const product = productMap[sale.product];
  const isOneTime = product?.isOneTime ?? false;
  const multiplier = isOneTime ? 1 : 12;
  const toNum = (v: any) => parseInt(v) || 0;

  let hekef = 0;
  let nifraim = 0;

  const match = contractMatch ?? contracts.find(c =>
    c.AgentId === customer?.AgentId &&
    c.productsGroup === product?.productGroup &&
    (c.minuySochen === sale.minuySochen || (c.minuySochen === undefined && !sale.minuySochen))
  );

  if (match) {
    hekef =
      toNum(sale.insPremia) * match.commissionHekef / 100 * multiplier +
      toNum(sale.pensiaPremia) * match.commissionHekef / 100 * multiplier +
      toNum(sale.pensiaZvira) * match.commissionNiud / 100 +
      toNum(sale.finansimPremia) * match.commissionHekef / 100 * multiplier +
      toNum(sale.finansimZvira) * match.commissionNiud / 100;

    if (!isOneTime) {
      nifraim =
        toNum(sale.insPremia) * match.commissionNifraim / 100 +
        toNum(sale.pensiaPremia) * match.commissionNifraim / 100 +
        toNum(sale.finansimZvira) * match.commissionNifraim / 100 / 12;
    }
  }

  return {
    commissionHekef: Math.round(hekef),
    commissionNifraim: Math.round(nifraim),
  };
};

  // ─── טעינת עסקאות Magic ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!customer) return;
    const agentId = customer.AgentId;
    const idList = idVariants(customer.IDCustomer).slice(0, 10);

    const load = async () => {
      setLoadingMagic(true);
      try {
        const q = query(
          collection(db, 'sales'),
          where('AgentId', '==', agentId),
          where('statusPolicy', 'in', ['פעילה', 'הצעה']),
          where('IDCustomer', 'in', idList),
        );
        const snap = await getDocs(q);
        const canon = canonId(customer.IDCustomer);
        const docs = snap.docs
          .map(d => ({ _id: d.id, ...(d.data() as any) }))
          .filter(s => canonId(s.IDCustomer) === canon);
        const rows = dedupeSales(docs);

        const enriched = rows.map(s => {
          const effectiveMonth = s.mounth || s.month;
          const contractMatch = contracts.find(
            c =>
              c.AgentId === agentId &&
              c.product === s.product &&
              c.company === s.company &&
              (c.minuySochen === s.minuySochen || (c.minuySochen === undefined && !s.minuySochen)),
          );
          const commissions = calculateCommissions(s, contractMatch);
          const sumPremia = (parseInt(s.insPremia) || 0) + (parseInt(s.pensiaPremia) || 0) + (parseInt(s.finansimPremia) || 0);
          const sumTzvira = (parseInt(s.pensiaZvira) || 0) + (parseInt(s.finansimZvira) || 0);
          return { ...s, month: effectiveMonth, ...commissions, sumPremia, sumTzvira };
        });

        setMagicSales(enriched);
        const totalNifraim = enriched.reduce((a, r) => a + (r.commissionNifraim || 0), 0);
        setMagicNifraim(totalNifraim);
      } catch (e) {
        addToast('error', 'כשל בטעינת עסקאות');
      } finally {
        setLoadingMagic(false);
      }
    };

if (contracts.length > 0 && Object.keys(productMap).length > 0) load();
  }, [customer, contracts, productMap]);

  // ─── טעינת נפרעים מקלטות ─────────────────────────────────────────────────────
  const loadExternal = async () => {
    if (!customer || !canSeeExternal) return;
    setLoadingExternal(true);
    try {
      const padded = Array.from(
        new Set(idVariants(customer.IDCustomer).map(v => v.padStart(9, '0'))),
      ).filter(Boolean);

      const buckets = await fetchExternalForCustomers({
        agentId: customer.AgentId,
        customerIds: padded,
        reportFromYm: reportMonth,
        reportToYm: reportMonth,
      });

      const rows: ExternalRow[] = [];
      let total = 0;
      for (const b of buckets) {
        for (const r of b.rows) {
          const amt = Number(r.commissionAmount || 0);
rows.push({ company: r.company ?? '', product: r.product ?? '', policyNumber: r.policyNumber ?? '', commissionAmount: amt, reportMonth: r.reportMonth });          total += amt;
        }
      }
      setExternalRows(rows);
      setExternalTotal(Number(total.toFixed(2)));
    } catch {
      addToast('error', 'כשל בטעינת נפרעים מקלטות');
    } finally {
      setLoadingExternal(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'nifraim' || activeTab === 'gaps') loadExternal();
  }, [activeTab, reportMonth, customer]);

  // ─── טעינת תא משפחתי ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'family' || !customer?.parentID) return;
    const load = async () => {
      setLoadingFamily(true);
      try {
        const q = query(
          collection(db, 'customer'),
          where('AgentId', '==', customer.AgentId),
          where('parentID', '==', customer.parentID),
        );
        const snap = await getDocs(q);
        setFamilyMembers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      } finally {
        setLoadingFamily(false);
      }
    };
    load();
  }, [activeTab, customer]);

  // ─── סיכומים ─────────────────────────────────────────────────────────────────
  const totalMagicHekef = useMemo(() => magicSales.reduce((a, r) => a + (r.commissionHekef || 0), 0), [magicSales]);
  const delta = externalTotal - magicNifraim;

  // ─── נפרעים vs Magic לכל שורה בלשונית נפרעים ────────────────────────────────
  const nifraimWithGap = useMemo(() => {
    return externalRows.map(ext => {
      const magicMatch = magicSales.find(
        s => String(s.company || '').trim() === String(ext.company || '').trim() &&
             (!ext.product || String(s.product || '').trim() === String(ext.product || '').trim()),
      );
      const magicVal = magicMatch?.commissionNifraim ?? null;
      const gap = magicVal !== null ? ext.commissionAmount - magicVal : null;
      return { ...ext, magicVal, gap };
    });
  }, [externalRows, magicSales]);

  // ─── ניווט לדף השוואה מלאה ───────────────────────────────────────────────────
  const openFullCompare = () => {
    if (!customer) return;
    const p = new URLSearchParams({
      agentId: customer.AgentId,
      customerId: customer.IDCustomer,
      reportMonth,
      returnTo: `/customers/${customerId}`,
    });
    router.push(`/importCommissionHub/CompareRealToReported?${p.toString()}`);
  };

  // ─── UI ──────────────────────────────────────────────────────────────────────
  if (loadingCustomer) {
    return <div className="cp-loading">טוען נתוני לקוח...</div>;
  }

  if (!customer) {
    return (
      <div className="cp-loading">
        לקוח לא נמצא.{' '}
        <button onClick={() => router.back()}>חזרה</button>
      </div>
    );
  }

  const sourceName =
    (customer.sourceValue && sourceLeadMap[customer.sourceValue]) ||
    (customer.sourceLead && sourceLeadMap[customer.sourceLead]) ||
    '—';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'magic', label: 'עסקאות Magic' },
  { key: 'nifraim', label: 'נפרעים מקלטות' },
  { key: 'gaps', label: 'פערים' },
  { key: 'family', label: 'קשרים משפחתיים' },
  ...(canAccessCrm ? [
    { key: 'notes' as TabKey, label: 'הערות' },
    { key: 'tasks' as TabKey, label: 'משימות' },
  ] : []),
];

  return (
    <div className="cp-page" dir="rtl">
      {/* ── Back ── */}
      <button className="cp-back" onClick={() => router.back()}>
        ← חזרה לרשימת לקוחות
      </button>

      {/* ── Header card ── */}
      <div className="cp-header-card">
        <div className="cp-header-top">
          <div className="cp-avatar">
            {initials(
              isEditing ? (editData.firstNameCustomer ?? '') : customer.firstNameCustomer,
              isEditing ? (editData.lastNameCustomer ?? '') : customer.lastNameCustomer,
            )}
          </div>
          <div className="cp-name-block">
            {isEditing ? (
              <div className="cp-edit-name-row">
                <input
                  className="cp-edit-input"
                  value={editData.firstNameCustomer ?? ''}
                  onChange={e => setEditData(p => ({ ...p, firstNameCustomer: e.target.value }))}
                  placeholder="שם פרטי"
                />
                <input
                  className="cp-edit-input"
                  value={editData.lastNameCustomer ?? ''}
                  onChange={e => setEditData(p => ({ ...p, lastNameCustomer: e.target.value }))}
                  placeholder="שם משפחה"
                />
              </div>
            ) : (
              <div className="cp-fullname">
                {customer.firstNameCustomer} {customer.lastNameCustomer}
              </div>
            )}
            <div className="cp-subline">
              {customer.phone && <span>{customer.phone}</span>}
              {customer.phone && customer.mail && <span> · </span>}
              {customer.mail && <span>{customer.mail}</span>}
            </div>
          </div>
          <div className="cp-header-actions">
            {isEditing ? (
              <>
                <button className="cp-btn-save" onClick={saveEdit} disabled={isSaving}>
                  {isSaving ? 'שומר...' : 'שמור'}
                </button>
                <button className="cp-btn-cancel" onClick={cancelEdit}>בטל</button>
              </>
            ) : (
              <button className="cp-btn-edit" onClick={startEdit}>✏ ערוך</button>
            )}
          </div>
        </div>

        <div className="cp-fields-grid">
          <div className="cp-field">
            <span className="cp-field-label">תעודת זהות</span>
            {isEditing ? (
              <input className="cp-edit-input-field" value={editData.IDCustomer ?? ''} onChange={e => setEditData(p => ({ ...p, IDCustomer: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{customer.IDCustomer}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">תאריך לידה</span>
            {isEditing ? (
              <input type="date" className="cp-edit-input-field" value={editData.birthday ?? ''} onChange={e => setEditData(p => ({ ...p, birthday: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{customer.birthday ? formatIsraeliDateOnly(customer.birthday) : '—'}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">מגדר</span>
            {isEditing ? (
              <select className="cp-edit-input-field" value={editData.gender ?? ''} onChange={e => setEditData(p => ({ ...p, gender: e.target.value }))}>
                <option value="">לא נבחר</option>
                <option value="זכר">זכר</option>
                <option value="נקבה">נקבה</option>
              </select>
            ) : (
              <span className="cp-field-value">{customer.gender || '—'}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">טלפון</span>
            {isEditing ? (
              <input className="cp-edit-input-field" value={editData.phone ?? ''} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{customer.phone || '—'}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">מייל</span>
            {isEditing ? (
              <input type="email" className="cp-edit-input-field" value={editData.mail ?? ''} onChange={e => setEditData(p => ({ ...p, mail: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{customer.mail || '—'}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">כתובת</span>
            {isEditing ? (
              <input className="cp-edit-input-field" value={editData.address ?? ''} onChange={e => setEditData(p => ({ ...p, address: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{customer.address || '—'}</span>
            )}
          </div>
          <div className="cp-field">
            <span className="cp-field-label">מקור ליד</span>
            <span className="cp-field-value">{sourceName}</span>
          </div>
          {(isEditing || customer.notes) && (
            <div className="cp-field cp-field-full">
              <span className="cp-field-label">הערות</span>
              {isEditing ? (
                <textarea className="cp-edit-input-field cp-edit-textarea" value={editData.notes ?? ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} rows={2} />
              ) : (
                <span className="cp-field-value">{customer.notes}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="cp-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`cp-tab${activeTab === t.key ? ' cp-tab-active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="cp-tab-content">

        {/* ── עסקאות Magic ── */}
        {activeTab === 'magic' && (
          <div>
            {loadingMagic ? (
              <div className="cp-loading-inline">טוען...</div>
            ) : magicSales.length === 0 ? (
              <div className="cp-empty">אין עסקאות פעילות ללקוח זה</div>
            ) : (
              <>
                <table className="cp-table">
                  <thead>
                    <tr>
                      <th>מוצר</th>
                      <th>חברה</th>
                      <th>חודש תוקף</th>
                      {canViewCommissions && <th>פרמיה</th>}
                      {canViewCommissions && <th>צבירה</th>}
                      {canViewCommissions && <th>עמלת היקף</th>}
                      {canViewCommissions && <th>נפרעים</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {magicSales.map((s, i) => (
                      <tr key={i}>
                        <td>{s.product}</td>
                        <td>{s.company}</td>
                        <td>{s.month ? formatIsraeliDateOnly(s.month) : '—'}</td>
                        {canViewCommissions && <td>{s.sumPremia?.toLocaleString()}</td>}
                        {canViewCommissions && <td>{s.sumTzvira?.toLocaleString()}</td>}
                        {canViewCommissions && <td>{s.commissionHekef?.toLocaleString()}</td>}
                        {canViewCommissions && <td>{s.commissionNifraim?.toLocaleString()}</td>}
                      </tr>
                    ))}
                  </tbody>
                  {canViewCommissions && (
                    <tfoot>
                      <tr>
<td colSpan={5} style={{ fontWeight: 'bold', textAlign: 'left' }}>
  סה&quot;כ
</td>
                        <td style={{ fontWeight: 'bold' }}>{totalMagicHekef.toLocaleString()} ₪</td>
                        <td style={{ fontWeight: 'bold' }}>{magicNifraim.toLocaleString()} ₪</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </>
            )}
          </div>
        )}

        {/* ── נפרעים מקלטות ── */}
        {activeTab === 'nifraim' && (
          <div>
            <div className="cp-month-bar">
              <label>חודש עיבוד:</label>
              <input
                type="month"
                value={reportMonth}
                onChange={e => setReportMonth(e.target.value)}
                className="cp-month-input"
              />
            </div>
            {!canSeeExternal ? (
              <div className="cp-empty">אין הרשאה לצפות בנתוני קלטות</div>
            ) : loadingExternal ? (
              <div className="cp-loading-inline">טוען...</div>
            ) : nifraimWithGap.length === 0 ? (
              <div className="cp-empty">אין נתוני קלטות לחודש זה</div>
            ) : (
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>חברה</th>
                    <th>מוצר</th>
                    <th>מספר פוליסה</th>
                    <th>סכום שדווח</th>
                    {canViewCommissions && <th>Magic מחושב</th>}
                    <th>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {nifraimWithGap.map((r, i) => (
                    <tr key={i}>
                      <td>{r.company}</td>
                      <td>{r.product || '—'}</td>
                      <td>{r.policyNumber || '—'}</td>
                      <td>{r.commissionAmount.toLocaleString()} ₪</td>
                      {canViewCommissions && (
                        <td>{r.magicVal !== null ? `${r.magicVal.toLocaleString()} ₪` : '—'}</td>
                      )}
                      <td>
                        {r.gap === null ? (
                          <span className="cp-badge cp-badge-neutral">לא נמצא ב-Magic</span>
                        ) : Math.abs(r.gap) < 1 ? (
                          <span className="cp-badge cp-badge-ok">תואם</span>
                        ) : (
                          <span
                            className="cp-badge cp-badge-gap"
                            onClick={openFullCompare}
                            title="לחץ לפתיחת מסך השוואה מלאה"
                          >
                            פער {r.gap > 0 ? '+' : ''}{Math.round(r.gap).toLocaleString()} ₪
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── פערים ── */}
        {activeTab === 'gaps' && (
          <div>
            <div className="cp-month-bar">
              <label>חודש עיבוד:</label>
              <input
                type="month"
                value={reportMonth}
                onChange={e => setReportMonth(e.target.value)}
                className="cp-month-input"
              />
            </div>
            {!canSeeExternal ? (
              <div className="cp-empty">אין הרשאה</div>
            ) : (
              <>
                <div className="cp-summary-cards">
                  <div className="cp-sum-card">
                    <div className="cp-sum-label">Magic — נפרעים מחושב</div>
                    <div className="cp-sum-val">{magicNifraim.toLocaleString()} ₪</div>
                  </div>
                  <div className="cp-sum-card">
                    <div className="cp-sum-label">קלטה — סכום שדווח</div>
                    <div className="cp-sum-val">{externalTotal.toLocaleString()} ₪</div>
                  </div>
                  <div className={`cp-sum-card${Math.abs(delta) > 0 ? ' cp-sum-card-warn' : ''}`}>
                    <div className="cp-sum-label">דלתא (קלטה − Magic)</div>
                    <div className="cp-sum-val">
                      {delta >= 0 ? '+' : ''}{delta.toLocaleString()} ₪
                    </div>
                  </div>
                </div>
                {canSeeExternal && (
                  <div style={{ marginTop: 16 }}>
                    <Button
                      onClick={openFullCompare}
                      text="מסך השוואה מלאה"
                      type="primary"
                      icon="on"
                      state="default"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── קשרים משפחתיים ── */}
        {activeTab === 'family' && (
          <div>
            {loadingFamily ? (
              <div className="cp-loading-inline">טוען...</div>
            ) : familyMembers.length === 0 ? (
              <div className="cp-empty">לא הוגדר תא משפחתי</div>
            ) : (
              <div className="cp-family-list">
                {familyMembers.map(m => {
                  const isMain = m.parentID === m.id;
                  const isCurrent = m.id === customerId;
                  return (
                    <div
                      key={m.id}
                      className={`cp-family-row${isCurrent ? ' cp-family-row-current' : ''}`}
                      onClick={() => !isCurrent && router.push(`/customers/${m.id}`)}
                      style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                    >
                      <div className="cp-fav">
                        {initials(m.firstNameCustomer, m.lastNameCustomer)}
                      </div>
                      <div className="cp-fmember-info">
                        <span className="cp-fmember-name">
                          {m.firstNameCustomer} {m.lastNameCustomer}
                          {isMain && <span className="cp-chip-main">ראשי</span>}
                          {isCurrent && <span className="cp-chip-current">נוכחי</span>}
                        </span>
<span className="cp-fmember-sub">ת&quot;ז {m.IDCustomer}</span>
                      </div>
                      {!isCurrent && <span className="cp-family-arrow">←</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── הערות ── */}
    {activeTab === 'notes' && (
  canAccessCrm
    ? <CustomerNotes customerId={customerId} agentId={customer.AgentId} />
    : <div className="cp-empty">אין הרשאה</div>
)}
{activeTab === 'tasks' && (
  canAccessCrm
    ? <CustomerTasks customerId={customerId} agentId={customer.AgentId} />
    : <div className="cp-empty">אין הרשאה</div>
)}
      </div>

      {/* ── Toasts ── */}
      {toasts.map(t => (
        <ToastNotification
          key={t.id}
          type={t.type}
          message={t.message}
          className={t.isHiding ? 'hide' : ''}
          onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
        />
      ))}
    </div>
  );
}
