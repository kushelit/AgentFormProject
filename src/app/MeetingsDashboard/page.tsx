'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { MeetingStage, MEETING_STAGE_META, getMeetingStageLabel } from '@/lib/meetingStages';
import './MeetingsDashboard.css';

type Tier = 'premium' | 'gold' | 'silver' | 'standard';

interface CustomerRow {
  id: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  phone?: string;
  mail?: string;
  customerTier?: Tier;
  responsibleUserId?: string;
  responsibleUserName?: string;
  meetingStage?: MeetingStage;
  meetingDate?: string;
}

interface AgentUser {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
}

const TIER_LABEL: Record<Tier, string> = {
  premium: 'פרימיום',
  gold: 'זהב',
  silver: 'כסף',
  standard: 'רגיל',
};

const TIER_CLASS: Record<Tier, string> = {
  premium: 'md-tier-premium',
  gold: 'md-tier-gold',
  silver: 'md-tier-silver',
  standard: 'md-tier-standard',
};

const STAGE_CLASS: Record<string, string> = {
  not_started: 'md-stage-neutral',
  contacted: 'md-stage-progress',
  scheduled: 'md-stage-positive',
  not_interested: 'md-stage-negative',
};

export default function MeetingsDashboard() {
  const router = useRouter();
  const { user, detail } = useAuth();
  const { canAccess: canAccessCrm } = usePermission('access_crm_module');
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [agentUsers, setAgentUsers] = useState<AgentUser[]>([]);
  const [loading, setLoading] = useState(false);

  // ── פילטרים ──
  const [filterResponsible, setFilterResponsible] = useState<'me' | 'all' | string>('me');
  const [filterTier, setFilterTier] = useState<'all' | Tier>('all');
  const [filterStage, setFilterStage] = useState<'all' | MeetingStage>('all');
  const [nameFilter, setNameFilter] = useState('');

  // ── טעינת אנשי צוות (לפילטר "אחראי") ──
  useEffect(() => {
    if (!selectedAgentId) return;
    const load = async () => {
      const q = query(
        collection(db, 'users'),
        where('agentId', '==', selectedAgentId),
        where('isActive', '==', true),
      );
      const snap = await getDocs(q);
      setAgentUsers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    };
    load();
  }, [selectedAgentId]);

  // ── טעינת לקוחות ──
  useEffect(() => {
    if (!selectedAgentId) return;
    const load = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'customer'), where('AgentId', '==', selectedAgentId));
        const snap = await getDocs(q);
        setCustomers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as CustomerRow[]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedAgentId]);

  const getUserName = (uid?: string) => {
    if (!uid) return '';
    const u = agentUsers.find(x => x.id === uid);
    return u?.name || u?.displayName || u?.email || uid;
  };

  // ── פילטור ──
  const filtered = useMemo(() => {
    let rows = customers;

    if (filterResponsible === 'me') {
      rows = rows.filter(c => c.responsibleUserId === user?.uid);
    } else if (filterResponsible !== 'all') {
      rows = rows.filter(c => c.responsibleUserId === filterResponsible);
    }

    if (filterTier !== 'all') {
      rows = rows.filter(c => (c.customerTier || 'standard') === filterTier);
    }

    if (filterStage !== 'all') {
      rows = rows.filter(c => (c.meetingStage || 'not_started') === filterStage);
    }

    if (nameFilter.trim()) {
      const q = nameFilter.trim().toLowerCase();
      rows = rows.filter(c =>
        `${c.firstNameCustomer ?? ''} ${c.lastNameCustomer ?? ''}`.toLowerCase().includes(q),
      );
    }

    return rows;
  }, [customers, filterResponsible, filterTier, filterStage, nameFilter, user?.uid]);

  const formatMeetingDate = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  if (canAccessCrm === false) {
    return (
      <div className="md-page" dir="rtl">
        <div className="md-empty">אין לך הרשאה לצפות בדף זה</div>
      </div>
    );
  }

  return (
    <div className="md-page" dir="rtl">
      <div className="md-header">
        <div>
          <div className="md-title">ריכוז לקוחות ותהליך פגישות</div>
          <div className="md-subtitle">{filtered.length} לקוחות מוצגים</div>
        </div>
      </div>

      {/* ── פילטרים ── */}
      <div className="md-filters">
        {detail && detail.role === 'admin' && (
          <div className="md-filter-group">
            <label className="md-filter-label">סוכן</label>
            <select className="md-select" value={selectedAgentId} onChange={handleAgentChange}>
              <option value="">בחר סוכן</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div className="md-filter-group">
          <label className="md-filter-label">אחראי</label>
          <div className="md-toggle">
            <button
              className={`md-toggle-btn${filterResponsible === 'me' ? ' active' : ''}`}
              onClick={() => setFilterResponsible('me')}
            >שלי</button>
            <button
              className={`md-toggle-btn${filterResponsible === 'all' ? ' active' : ''}`}
              onClick={() => setFilterResponsible('all')}
            >כולם</button>
          </div>
          <select
            className="md-select"
            value={filterResponsible === 'me' || filterResponsible === 'all' ? '' : filterResponsible}
            onChange={e => { if (e.target.value) setFilterResponsible(e.target.value); }}
          >
            <option value="">חבר צוות...</option>
            {agentUsers.filter(u => u.id !== user?.uid).map(u => (
              <option key={u.id} value={u.id}>{u.name || u.displayName || u.email}</option>
            ))}
          </select>
        </div>

        <div className="md-filter-group">
          <label className="md-filter-label">דירוג</label>
          <select className="md-select" value={filterTier} onChange={e => setFilterTier(e.target.value as any)}>
            <option value="all">הכל</option>
            <option value="premium">פרימיום</option>
            <option value="gold">זהב</option>
            <option value="silver">כסף</option>
            <option value="standard">רגיל</option>
          </select>
        </div>

        <div className="md-filter-group">
          <label className="md-filter-label">סטטוס תהליך</label>
          <select className="md-select" value={filterStage} onChange={e => setFilterStage(e.target.value as any)}>
            <option value="all">הכל</option>
            {Object.entries(MEETING_STAGE_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>

        <div className="md-filter-group md-filter-search">
          <label className="md-filter-label">חיפוש לפי שם</label>
          <input
            className="md-input"
            placeholder="שם לקוח..."
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
          />
        </div>
      </div>

      {/* ── טבלה ── */}
      {loading ? (
        <div className="md-loading">טוען לקוחות...</div>
      ) : filtered.length === 0 ? (
        <div className="md-empty">אין לקוחות להצגה לפי הסינון הנוכחי</div>
      ) : (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                <th>לקוח</th>
                <th>טלפון</th>
                <th>דירוג</th>
                <th>אחראי</th>
                <th>סטטוס תהליך</th>
                <th>מועד פגישה</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const tier = (c.customerTier || 'standard') as Tier;
                const stage = (c.meetingStage || 'not_started') as MeetingStage;
                return (
                  <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)} className="md-row">
                    <td className="md-cell-name">
                      {c.firstNameCustomer} {c.lastNameCustomer}
                    </td>
                    <td>{c.phone || '—'}</td>
                    <td>
                      {tier !== 'standard' && (
                        <span className={`md-tier-badge ${TIER_CLASS[tier]}`}>{TIER_LABEL[tier]}</span>
                      )}
                      {tier === 'standard' && <span className="md-muted">—</span>}
                    </td>
                    <td>{c.responsibleUserName || getUserName(c.responsibleUserId) || '—'}</td>
                    <td>
                      <span className={`md-stage-badge ${STAGE_CLASS[stage]}`}>
                        {MEETING_STAGE_META[stage].icon} {getMeetingStageLabel(stage)}
                      </span>
                    </td>
                    <td>{stage === 'scheduled' && c.meetingDate ? formatMeetingDate(c.meetingDate) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
