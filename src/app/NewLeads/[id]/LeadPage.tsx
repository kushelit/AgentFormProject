'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  collection, doc, getDoc, getDocs, query, where,
  updateDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchMD from '@/hooks/useMD';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';
import CustomerNotes from '@/app/customers/[id]/CustomerNotes';
import CustomerTasks from '@/app/customers/[id]/CustomerTasks';
import '@/app/customers/[id]/CustomerPage.css';
import DialogNotification from '@/components/DialogNotification';
// ─── טיפוסים ──────────────────────────────────────────────────────────────────

interface LeadDoc {
  id: string;
  AgentId: string;
  firstNameCustomer?: string;
  lastNameCustomer?: string;
  IDCustomer?: string;
  idCardIssueDate?: string;
  birthday?: string;
  gender?: string;
  phone?: string;
  mail?: string;
  address?: string;
  returnDate?: string;
  lastContactDate?: string;
  sourceValue?: string;
  selectedStatusLead?: string;
  campaign?: string;
  availableFunds?: string;
  retirementFunds?: string;
  consentForInformationRequest?: boolean;
  workerId?: string;
  notes?: string;
}

type TabKey = 'notes' | 'tasks';

const initials = (first?: string, last?: string) =>
  `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();

const mapGenderToHebrew = (g?: string) => {
  if (g === 'male') return 'זכר';
  if (g === 'female') return 'נקבה';
  return g || '—';
};

// ─── קומפוננט ראשי ────────────────────────────────────────────────────────────

export default function LeadPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { formatIsraeliDateOnly, sourceLeadMap, fetchSourceLeadMap } = useFetchMD();
  const { toasts, addToast, setToasts } = useToast();
  const { agents, selectedAgentId } = useFetchAgentData();
  const { canAccess: canAccessCrm } = usePermission('access_crm_module');

  const leadId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');

  const [lead, setLead] = useState<LeadDoc | null>(null);
  const [loadingLead, setLoadingLead] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('notes');

  // עריכה
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<LeadDoc>>({});
  const [isSaving, setIsSaving] = useState(false);

  // מטא-דאטה
  const [statusLeadMap, setStatusLeadMap] = useState<{ id: string; statusLeadName: string }[]>([]);
  const [sourceLeadList, setSourceLeadList] = useState<{ id: string; sourceLead: string }[]>([]);
  const [workers, setWorkers] = useState<{ id: string; name: string }[]>([]);

  // המרה
  const [converting, setConverting] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState(false);
  // ─── טעינת ליד ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!leadId) return;
    const load = async () => {
      setLoadingLead(true);
      try {
        const snap = await getDoc(doc(db, 'leads', leadId));
        if (snap.exists()) {
          const data = { id: snap.id, ...(snap.data() as Omit<LeadDoc, 'id'>) };
          setLead(data);
          if (data.AgentId) {
            fetchSourceLeadMap(data.AgentId);
            loadMeta(data.AgentId);
          }
        }
      } finally {
        setLoadingLead(false);
      }
    };
    load();
  }, [leadId]);

  // ─── טעינת מטא-דאטה ──────────────────────────────────────────────────────────
  const loadMeta = async (agentId: string) => {
    // סטטוסים
    const statusSnap = await getDocs(collection(db, 'statusLead'));
    setStatusLeadMap(statusSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));

    // מקורות ליד
    const sourceSnap = await getDocs(query(
      collection(db, 'sourceLead'),
      where('AgentId', '==', agentId),
      where('statusLead', '==', true),
    ));
    setSourceLeadList(sourceSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));

    // עובדים פעילים
    const workersSnap = await getDocs(query(
      collection(db, 'users'),
      where('agentId', '==', agentId),
      where('isActive', '==', true),
    ));
    setWorkers(workersSnap.docs.map(d => {
      const wd = d.data() as any;
      return { id: d.id, name: wd.name || wd.displayName || wd.email || d.id };
    }));
  };

  // ─── עריכה ───────────────────────────────────────────────────────────────────
  const startEdit = () => {
    if (!lead) return;
    setEditData({
      firstNameCustomer: lead.firstNameCustomer ?? '',
      lastNameCustomer: lead.lastNameCustomer ?? '',
      IDCustomer: lead.IDCustomer ?? '',
      idCardIssueDate: lead.idCardIssueDate ?? '',
      birthday: lead.birthday ?? '',
      gender: lead.gender ?? '',
      phone: lead.phone ?? '',
      mail: lead.mail ?? '',
      address: lead.address ?? '',
      returnDate: lead.returnDate ?? '',
      sourceValue: lead.sourceValue ?? '',
      selectedStatusLead: lead.selectedStatusLead ?? '',
      campaign: lead.campaign ?? '',
      availableFunds: lead.availableFunds ?? '',
      retirementFunds: lead.retirementFunds ?? '',
      consentForInformationRequest: lead.consentForInformationRequest ?? false,
      workerId: lead.workerId ?? '',
      notes: lead.notes ?? '',
    });
    setIsEditing(true);
  };

  const cancelEdit = () => { setIsEditing(false); setEditData({}); };

  const saveEdit = async () => {
    if (!lead) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        ...editData,
        lastUpdateDate: serverTimestamp(),
      });
      setLead(prev => prev ? { ...prev, ...editData } : prev);
      setIsEditing(false);
      setEditData({});
      addToast('success', 'פרטי הליד עודכנו בהצלחה');
    } catch {
      addToast('error', 'כשל בשמירת הנתונים');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── המרה ללקוח עם migration מלא ─────────────────────────────────────────────
 const handleConvert = () => {
  if (!lead) return;
  if (!lead.IDCustomer || !lead.firstNameCustomer || !lead.lastNameCustomer) {
    addToast('error', 'להמרה נדרשים: שם פרטי, שם משפחה ותעודת זהות');
    return;
  }
  setConfirmDialog(true);
};

const doConvert = async () => {
  if (!lead) return;
  setConfirmDialog(false);
  setConverting(true);
  try {
    const existQ = query(
      collection(db, 'customer'),
      where('IDCustomer', '==', lead.IDCustomer),
      where('AgentId', '==', lead.AgentId),
    );
    const existSnap = await getDocs(existQ);
    if (!existSnap.empty) {
      addToast('error', 'לקוח עם תז זה כבר קיים במערכת');
      return;
    }

    const customerRef = doc(collection(db, 'customer'));
    await setDoc(customerRef, {
      AgentId: lead.AgentId,
      firstNameCustomer: lead.firstNameCustomer || '',
      lastNameCustomer: lead.lastNameCustomer || '',
      fullNameCustomer: `${lead.firstNameCustomer || ''} ${lead.lastNameCustomer || ''}`.trim(),
      IDCustomer: lead.IDCustomer,
      parentID: customerRef.id,
      phone: lead.phone || '',
      mail: lead.mail || '',
      address: lead.address || '',
      birthday: lead.birthday || '',
      issueDay: lead.idCardIssueDate || '',
      gender: mapGenderToHebrew(lead.gender),
      notes: lead.notes || '',
      sourceValue: lead.sourceValue || '',
      sourceLead: lead.sourceValue || '',
      convertedFromLeadId: lead.id,
      createdAt: serverTimestamp(),
      lastUpdateDate: serverTimestamp(),
    });

    const notesSnap = await getDocs(query(
      collection(db, 'customerNotes'),
      where('customerId', '==', lead.id),
    ));
    for (const n of notesSnap.docs) {
      await updateDoc(n.ref, { customerId: customerRef.id });
    }

    const tasksSnap = await getDocs(query(
      collection(db, 'customerTasks'),
      where('customerId', '==', lead.id),
    ));
    for (const t of tasksSnap.docs) {
      await updateDoc(t.ref, { customerId: customerRef.id });
    }

    const convertedStatus = statusLeadMap.find(
      s => s.statusLeadName === 'הפך ללקוח',
    )?.id ?? '';
    await updateDoc(doc(db, 'leads', lead.id), {
      selectedStatusLead: convertedStatus,
      lastUpdateDate: serverTimestamp(),
    });

    addToast('success', `${lead.firstNameCustomer} ${lead.lastNameCustomer} הומר ללקוח בהצלחה`);
    setTimeout(() => router.push(`/customers/${customerRef.id}`), 1200);
  } catch {
    addToast('error', 'שגיאה ביצירת הלקוח');
  } finally {
    setConverting(false);
  }
};

  // ─── UI ──────────────────────────────────────────────────────────────────────
  if (loadingLead) return <div className="cp-loading">טוען נתוני ליד...</div>;
  if (!lead) return (
    <div className="cp-loading">
      ליד לא נמצא. <button onClick={() => router.back()}>חזרה</button>
    </div>
  );

  const statusName = statusLeadMap.find(s => s.id === lead.selectedStatusLead)?.statusLeadName || '—';
  const sourceName = sourceLeadMap[lead.sourceValue ?? ''] || '—';
  const workerName = workers.find(w => w.id === lead.workerId)?.name || '—';

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'notes', label: 'הערות' },
    { key: 'tasks', label: 'משימות' },
  ];

  return (
    <div className="cp-page" dir="rtl">
      {/* ── Back ── */}
      <button className="cp-back" onClick={() => router.back()}>
        ← חזרה לרשימת לידים
      </button>

      {/* ── Header card ── */}
      <div className="cp-header-card">
        <div className="cp-header-top">
          <div className="cp-avatar">
            {initials(
              isEditing ? editData.firstNameCustomer : lead.firstNameCustomer,
              isEditing ? editData.lastNameCustomer : lead.lastNameCustomer,
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
                {lead.firstNameCustomer} {lead.lastNameCustomer}
                <span className="cp-tier-badge" style={{ background: '#e8f4fd', color: '#1565c0', border: '1px solid #90caf9', marginRight: 10 }}>
                  ליד
                </span>
              </div>
            )}
            <div className="cp-subline">
              {lead.phone && <span>{lead.phone}</span>}
              {lead.phone && lead.mail && <span> · </span>}
              {lead.mail && <span>{lead.mail}</span>}
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
              <>
                <button className="cp-btn-edit" onClick={startEdit}>✏ ערוך</button>
              <button
  className="cp-btn-save"
  onClick={() => {
    if (!lead.IDCustomer || !lead.firstNameCustomer || !lead.lastNameCustomer) {
      addToast('error', 'להמרה נדרשים: שם פרטי, שם משפחה ותעודת זהות');
      return;
    }
    setConfirmDialog(true);
  }}
  disabled={converting}
  style={{ background: '#2e7d32' }}
>
  {converting ? 'ממיר...' : '→ המר ללקוח'}
</button>
              </>
            )}
          </div>
        </div>

        {/* ── שדות ── */}
        <div className="cp-fields-grid">

          <div className="cp-field">
            <span className="cp-field-label">תעודת זהות</span>
            {isEditing ? (
              <input className="cp-edit-input-field" value={editData.IDCustomer ?? ''} onChange={e => setEditData(p => ({ ...p, IDCustomer: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{lead.IDCustomer || '—'}</span>
            )}
          </div>

          <div className="cp-field">
            <span className="cp-field-label">תאריך הנפקת ת.ז</span>
            {isEditing ? (
              <input type="date" className="cp-edit-input-field" value={editData.idCardIssueDate ?? ''} onChange={e => setEditData(p => ({ ...p, idCardIssueDate: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{lead.idCardIssueDate ? formatIsraeliDateOnly(lead.idCardIssueDate) : '—'}</span>
            )}
          </div>

          <div className="cp-field">
            <span className="cp-field-label">תאריך לידה</span>
            {isEditing ? (
              <input type="date" className="cp-edit-input-field" value={editData.birthday ?? ''} onChange={e => setEditData(p => ({ ...p, birthday: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{lead.birthday ? formatIsraeliDateOnly(lead.birthday) : '—'}</span>
            )}
          </div>

          <div className="cp-field">
            <span className="cp-field-label">מגדר</span>
            {isEditing ? (
              <select className="cp-edit-input-field" value={editData.gender ?? ''} onChange={e => setEditData(p => ({ ...p, gender: e.target.value }))}>
                <option value="">לא נבחר</option>
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
              </select>
            ) : (
              <span className="cp-field-value">{mapGenderToHebrew(lead.gender)}</span>
            )}
          </div>

          <div className="cp-field">
            <span className="cp-field-label">טלפון</span>
            {isEditing ? (
              <input className="cp-edit-input-field" value={editData.phone ?? ''} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{lead.phone || '—'}</span>
            )}
          </div>

          <div className="cp-field">
            <span className="cp-field-label">מייל</span>
            {isEditing ? (
              <input type="email" className="cp-edit-input-field" value={editData.mail ?? ''} onChange={e => setEditData(p => ({ ...p, mail: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{lead.mail || '—'}</span>
            )}
          </div>

          <div className="cp-field">
            <span className="cp-field-label">כתובת</span>
            {isEditing ? (
              <input className="cp-edit-input-field" value={editData.address ?? ''} onChange={e => setEditData(p => ({ ...p, address: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{lead.address || '—'}</span>
            )}
          </div>

          <div className="cp-field">
            <span className="cp-field-label">סטטוס ליד</span>
            {isEditing ? (
              <select className="cp-edit-input-field" value={editData.selectedStatusLead ?? ''} onChange={e => setEditData(p => ({ ...p, selectedStatusLead: e.target.value }))}>
                <option value="">בחר סטטוס</option>
                {statusLeadMap.map(s => <option key={s.id} value={s.id}>{s.statusLeadName}</option>)}
              </select>
            ) : (
              <span className="cp-field-value">{statusName}</span>
            )}
          </div>

          <div className="cp-field">
            <span className="cp-field-label">תאריך חזרה</span>
            {isEditing ? (
              <input
                type="datetime-local"
                className="cp-edit-input-field"
                value={(editData.returnDate ?? '').replace(' ', 'T')}
                onChange={e => setEditData(p => ({ ...p, returnDate: e.target.value.replace('T', ' ') }))}
              />
            ) : (
              <span className="cp-field-value">
                {lead.returnDate ? new Date(lead.returnDate.replace(' ', 'T')).toLocaleString('he-IL') : '—'}
              </span>
            )}
          </div>

          <div className="cp-field">
            <span className="cp-field-label">נציג</span>
            {isEditing ? (
              <select className="cp-edit-input-field" value={editData.workerId ?? ''} onChange={e => setEditData(p => ({ ...p, workerId: e.target.value }))}>
                <option value="">בחר נציג</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            ) : (
              <span className="cp-field-value">{workerName}</span>
            )}
          </div>

          <div className="cp-field">
            <span className="cp-field-label">מקור ליד</span>
            {isEditing ? (
              <select className="cp-edit-input-field" value={editData.sourceValue ?? ''} onChange={e => setEditData(p => ({ ...p, sourceValue: e.target.value }))}>
                <option value="">בחר מקור</option>
                {sourceLeadList.map(s => <option key={s.id} value={s.id}>{s.sourceLead}</option>)}
              </select>
            ) : (
              <span className="cp-field-value">{sourceName}</span>
            )}
          </div>

          <div className="cp-field">
            <span className="cp-field-label">קמפיין</span>
            {isEditing ? (
              <input className="cp-edit-input-field" value={editData.campaign ?? ''} onChange={e => setEditData(p => ({ ...p, campaign: e.target.value }))} />
            ) : (
              <span className="cp-field-value">{lead.campaign || '—'}</span>
            )}
          </div>
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
        {activeTab === 'notes' && (
          <CustomerNotes customerId={leadId} agentId={lead.AgentId} />
        )}
        {activeTab === 'tasks' && (
          <CustomerTasks customerId={leadId} agentId={lead.AgentId} />
        )}
      </div>
{confirmDialog && (
  <DialogNotification
    type="warning"
    title="המרה ללקוח"
    message={`להמיר את ${lead.firstNameCustomer} ${lead.lastNameCustomer} ללקוח?`}
    onConfirm={doConvert}
    onCancel={() => setConfirmDialog(false)}
    confirmText="המר"
  />
)}
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
