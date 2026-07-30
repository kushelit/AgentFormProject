'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { MeetingStage, MEETING_STAGE_META, MEETING_STAGE_ORDER, getMeetingStageLabel } from '@/lib/meetingStages';
import { saveAs } from 'file-saver';
import './MeetingsDashboard.css';

type Tier = 'premium' | 'gold' | 'silver' | 'standard';

interface CustomerRow {
  id: string;
  IDCustomer?: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  phone?: string;
  mail?: string;
  customerTier?: Tier;
  responsibleUserId?: string;
  responsibleUserName?: string;
  meetingStage?: MeetingStage;
  meetingDate?: string;
  contactedAt?: any;
}

interface AgentUser {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
}

type SortField = 'name' | 'phone' | 'tier' | 'responsible' | 'stage' | 'contacted' | 'date';
type SortDir = 'asc' | 'desc';

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

// ── דירוג עזר למיון "דירוג לקוח" ──
const TIER_RANK: Record<Tier, number> = { standard: 0, silver: 1, gold: 2, premium: 3 };

// ── צבע התג לכל שלב, נגזר אוטומטית מ-MEETING_STAGE_META — אין צורך לעדכן כאן כשמוסיפים שלב חדש ──
const getStageClass = (stage: MeetingStage): string => {
  const meta = MEETING_STAGE_META[stage];
  if (!meta) return 'md-stage-neutral';
  if (meta.isNegative) return 'md-stage-negative';
  if (meta.isFinal) return 'md-stage-positive';
  if (stage === 'not_started') return 'md-stage-neutral';
  return 'md-stage-progress';
};

// ── דירוג עזר למיון "סטטוס תהליך", נגזר מ-MEETING_STAGE_ORDER ──
// שלבים סופיים-שליליים (כמו "לא מעוניין") אינם ב-MEETING_STAGE_ORDER, ומוצבים בסוף
const STAGE_RANK: Record<string, number> = {};
MEETING_STAGE_ORDER.forEach((s, i) => { STAGE_RANK[s] = i; });
Object.keys(MEETING_STAGE_META).forEach(key => {
  if (!(key in STAGE_RANK)) STAGE_RANK[key] = MEETING_STAGE_ORDER.length;
});

// ── ממיר בבטחה Firestore Timestamp או מחרוזת ISO לאובייקט Date ──
const toSafeDate = (v: any): Date | null => {
  if (!v) return null;
  const d = typeof v?.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export default function MeetingsDashboard() {
  const router = useRouter();
  const { user, detail } = useAuth();
  const { canAccess: canAccessCrm } = usePermission('access_crm_module');
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [agentUsers, setAgentUsers] = useState<AgentUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // ── פילטרים ──
  const [filterResponsible, setFilterResponsible] = useState<'me' | 'all' | string>('me');
  const [filterTier, setFilterTier] = useState<'all' | Tier>('all');
  const [filterStage, setFilterStage] = useState<'all' | MeetingStage>('all');
  const [nameFilter, setNameFilter] = useState(''); // ── חיפוש חופשי: שם או ת"ז ──

  // ── מיון ──
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return <span className="md-sort-icon md-sort-icon-idle">⇅</span>;
    return <span className="md-sort-icon md-sort-icon-active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

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

    // ── חיפוש חופשי: מתאים גם לשם (פרטי+משפחה) וגם לת"ז ──
    if (nameFilter.trim()) {
      const q = nameFilter.trim().toLowerCase();
      rows = rows.filter(c => {
        const name = `${c.firstNameCustomer ?? ''} ${c.lastNameCustomer ?? ''}`.toLowerCase();
        const id = (c.IDCustomer ?? '').toLowerCase();
        return name.includes(q) || id.includes(q);
      });
    }

    return rows;
  }, [customers, filterResponsible, filterTier, filterStage, nameFilter, user?.uid]);

  // ── מיון על גבי הרשימה המסוננת ──
  const sorted = useMemo(() => {
    if (!sortField) return filtered;

    const dirMul = sortDir === 'asc' ? 1 : -1;

    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': {
          const nameA = `${a.firstNameCustomer ?? ''} ${a.lastNameCustomer ?? ''}`.trim();
          const nameB = `${b.firstNameCustomer ?? ''} ${b.lastNameCustomer ?? ''}`.trim();
          cmp = nameA.localeCompare(nameB, 'he');
          break;
        }
        case 'phone': {
          cmp = (a.phone || '').localeCompare(b.phone || '');
          break;
        }
        case 'tier': {
          const rankA = TIER_RANK[(a.customerTier || 'standard') as Tier];
          const rankB = TIER_RANK[(b.customerTier || 'standard') as Tier];
          cmp = rankA - rankB;
          break;
        }
        case 'responsible': {
          const nameA = a.responsibleUserName || getUserName(a.responsibleUserId) || '';
          const nameB = b.responsibleUserName || getUserName(b.responsibleUserId) || '';
          cmp = nameA.localeCompare(nameB, 'he');
          break;
        }
        case 'stage': {
          const rankA = STAGE_RANK[a.meetingStage || 'not_started'] ?? 0;
          const rankB = STAGE_RANK[b.meetingStage || 'not_started'] ?? 0;
          cmp = rankA - rankB;
          break;
        }
        case 'contacted': {
          const timeA = toSafeDate(a.contactedAt)?.getTime() ?? 0;
          const timeB = toSafeDate(b.contactedAt)?.getTime() ?? 0;
          cmp = timeA - timeB;
          break;
        }
        case 'date': {
          const timeA = a.meetingDate ? new Date(a.meetingDate).getTime() : 0;
          const timeB = b.meetingDate ? new Date(b.meetingDate).getTime() : 0;
          cmp = timeA - timeB;
          break;
        }
      }
      return cmp * dirMul;
    });

    return rows;
  }, [filtered, sortField, sortDir, agentUsers]);

  const formatMeetingDate = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  const formatContactedAt = (v?: any) => {
    const d = toSafeDate(v);
    if (!d) return '';
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  // ── ייצוא דוח — בדיוק מה שמוצג כרגע על המסך (אחרי סינון ומיון) ──
  const exportToExcel = async () => {
    if (!sorted.length || isExporting) return;
    setIsExporting(true);
    try {
      const headers = ['לקוח', 'ת"ז', 'טלפון', 'דירוג', 'אחראי', 'סטטוס תהליך', 'יצירת קשר אחרונה', 'מועד פגישה'];

      const rows = sorted.map(c => {
        const tier = (c.customerTier || 'standard') as Tier;
        const stage = (c.meetingStage || 'not_started') as MeetingStage;
        return [
          `${c.firstNameCustomer ?? ''} ${c.lastNameCustomer ?? ''}`.trim(),
          c.IDCustomer || '',
          c.phone || '',
          TIER_LABEL[tier],
          c.responsibleUserName || getUserName(c.responsibleUserId) || '',
          getMeetingStageLabel(stage),
          c.contactedAt ? formatContactedAt(c.contactedAt) : '',
          stage === 'scheduled' && c.meetingDate ? formatMeetingDate(c.meetingDate) : '',
        ];
      });

      const res = await fetch('/api/export-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetName: 'תהליך פגישות', headers, rows }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      saveAs(blob, 'דוח_תהליך_פגישות.xlsx');
    } finally {
      setIsExporting(false);
    }
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
        <button
          type="button"
          className="md-btn-export"
          onClick={exportToExcel}
          disabled={!sorted.length || isExporting}
          title={!sorted.length ? 'אין נתונים להורדה' : ''}
        >
          {isExporting ? 'מפיק דוח...' : `⬇ הורד דוח (${sorted.length})`}
        </button>
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
          <label className="md-filter-label">חיפוש לפי שם / ת&quot;ז</label>
          <input
            className="md-input"
            placeholder="שם לקוח או ת&quot;ז..."
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
          />
        </div>
      </div>

      {/* ── טבלה ── */}
      {loading ? (
        <div className="md-loading">טוען לקוחות...</div>
      ) : sorted.length === 0 ? (
        <div className="md-empty">אין לקוחות להצגה לפי הסינון הנוכחי</div>
      ) : (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                <th className="md-th-sortable" onClick={() => handleSort('name')}>
                  לקוח {sortIndicator('name')}
                </th>
                <th className="md-th-sortable" onClick={() => handleSort('phone')}>
                  טלפון {sortIndicator('phone')}
                </th>
                <th className="md-th-sortable" onClick={() => handleSort('tier')}>
                  דירוג {sortIndicator('tier')}
                </th>
                <th className="md-th-sortable" onClick={() => handleSort('responsible')}>
                  אחראי {sortIndicator('responsible')}
                </th>
                <th className="md-th-sortable" onClick={() => handleSort('stage')}>
                  סטטוס תהליך {sortIndicator('stage')}
                </th>
                <th className="md-th-sortable" onClick={() => handleSort('contacted')}>
                  יצירת קשר אחרונה {sortIndicator('contacted')}
                </th>
                <th className="md-th-sortable" onClick={() => handleSort('date')}>
                  מועד פגישה {sortIndicator('date')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => {
                const tier = (c.customerTier || 'standard') as Tier;
                const stage = (c.meetingStage || 'not_started') as MeetingStage;
                return (
                  <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)} className="md-row">
                    <td className="md-cell-name">
                      {c.firstNameCustomer} {c.lastNameCustomer}
                      {c.IDCustomer && <div className="md-cell-subid">{c.IDCustomer}</div>}
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
                      <span className={`md-stage-badge ${getStageClass(stage)}`}>
                        {MEETING_STAGE_META[stage].icon} {getMeetingStageLabel(stage)}
                      </span>
                    </td>
                    <td>{c.contactedAt ? formatContactedAt(c.contactedAt) : <span className="md-muted">—</span>}</td>
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