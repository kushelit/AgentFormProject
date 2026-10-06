'use client';
import { apiFetch } from '@/lib/apiFetch';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import {
  MeetingStage,
  MEETING_STAGE_META,
  MEETING_STAGE_ORDER,
  MEETING_STAGE_GROUPS,
  ContactLogEntry,
  StageHistoryEntry,
  getMeetingStageLabel,
  getStageGroup,
  getLastContactDate,
  toSafeDate,
  toDateInputValue,
} from '@/lib/meetingStages';
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
  recommendationsDate?: string;
  meetingStageUpdatedAt?: any;
  lastContactAt?: any;
  nextContactDate?: string;
  contactLog?: ContactLogEntry[];
  stageHistory?: StageHistoryEntry[];
}

interface AgentUser {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
}

type SortField = 'name' | 'phone' | 'tier' | 'responsible' | 'stage' | 'contacted' | 'date' | 'reminder';
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

// ── צבע התג לכל שלב, נגזר אוטומטית מ-MEETING_STAGE_META.kind — אין צורך לעדכן כאן כשמוסיפים שלב חדש ──
const getStageClass = (stage: MeetingStage): string => {
  const meta = MEETING_STAGE_META[stage];
  if (!meta) return 'md-stage-neutral';
  if (meta.kind === 'exit') return 'md-stage-negative';
  if (meta.kind === 'success') return 'md-stage-positive';
  if (meta.kind === 'pending') return 'md-stage-neutral';
  return 'md-stage-progress';
};

// ── דירוג עזר למיון "סטטוס תהליך", נגזר מ-MEETING_STAGE_ORDER; יציאות מוצבות בסוף ──
const STAGE_RANK: Record<string, number> = {};
MEETING_STAGE_ORDER.forEach((s, i) => { STAGE_RANK[s] = i; });
Object.keys(MEETING_STAGE_META).forEach(key => {
  if (!(key in STAGE_RANK)) STAGE_RANK[key] = MEETING_STAGE_ORDER.length;
});

// ── המועד הקרוב של הלקוח: פגישה שתואמה או פגישת המלצות ──
const getNextMeeting = (c: CustomerRow): { at: string; label: string } | null => {
  if (c.meetingStage === 'scheduled' && c.meetingDate) return { at: c.meetingDate, label: '' };
  if (c.meetingStage === 'recommendations_meeting' && c.recommendationsDate) {
    return { at: c.recommendationsDate, label: 'המלצות: ' };
  }
  return null;
};

// ══════════ KPI — תמונת מצב נוכחית: כל לקוח בדלי אחד לפי הסטטוס שלו עכשיו ══════════
type KpiTone = 'blue' | 'green' | 'red' | 'gray';

const KPI_TONE_BY_KIND: Record<string, KpiTone> = {
  pending: 'gray',
  active: 'blue',
  success: 'green',
  exit: 'red',
};

// סדר הכרטיסים = סדר ההגדרה ב-MEETING_STAGE_META (מסלול ואז יציאות). שלב חדש מופיע אוטומטית.
const KPI_STAGES = Object.keys(MEETING_STAGE_META) as MeetingStage[];

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
  const [filterStage, setFilterStage] = useState<string>('all'); // 'all' | MeetingStage | 'group:<key>'
  const [nameFilter, setNameFilter] = useState(''); // ── חיפוש חופשי: שם או ת"ז ──

  // ── KPI: כרטיס "תזכורות" מסנן את הטבלה (כרטיסי הסטטוס מסננים דרך filterStage) ──
  const [remindersOnly, setRemindersOnly] = useState(false);

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

  // ── היקף: אחראי + דירוג + חיפוש. ה-KPI מחושבים על ההיקף הזה (לא מושפעים מסינון סטטוס/כרטיס) ──
  const scoped = useMemo(() => {
    let rows = customers;

    if (filterResponsible === 'me') {
      rows = rows.filter(c => c.responsibleUserId === user?.uid);
    } else if (filterResponsible !== 'all') {
      rows = rows.filter(c => c.responsibleUserId === filterResponsible);
    }

    if (filterTier !== 'all') {
      rows = rows.filter(c => (c.customerTier || 'standard') === filterTier);
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
  }, [customers, filterResponsible, filterTier, nameFilter, user?.uid]);

  // ── KPI: כמה לקוחות יש עכשיו בכל סטטוס. כל לקוח נספר פעם אחת, לכן הסכום = scoped.length ──
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of scoped) {
      const s = c.meetingStage || 'not_started';
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [scoped]);

  // תזכורות שהגיע זמנן — לא סטטוס, אלא חיתוך על פני הלקוחות
  const reminderCount = useMemo(() => {
    const todayKey = toDateInputValue(new Date());
    return scoped.filter(c => !!c.nextContactDate && c.nextContactDate <= todayKey).length;
  }, [scoped]);

  // ── פילטור הטבלה: היקף + סטטוס (או כרטיס "תזכורות") ──
  const filtered = useMemo(() => {
    let rows = scoped;

    if (filterStage.startsWith('group:')) {
      const group = filterStage.slice(6);
      rows = rows.filter(c => getStageGroup(c.meetingStage) === group);
    } else if (filterStage !== 'all') {
      rows = rows.filter(c => (c.meetingStage || 'not_started') === filterStage);
    }

    if (remindersOnly) {
      rows = rows.filter(c => !!c.nextContactDate && c.nextContactDate <= toDateInputValue(new Date()));
    }

    return rows;
  }, [scoped, filterStage, remindersOnly]);

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
          const timeA = getLastContactDate(a)?.getTime() ?? 0;
          const timeB = getLastContactDate(b)?.getTime() ?? 0;
          cmp = timeA - timeB;
          break;
        }
        case 'date': {
          const nmA = getNextMeeting(a);
          const nmB = getNextMeeting(b);
          const timeA = nmA ? new Date(nmA.at).getTime() : 0;
          const timeB = nmB ? new Date(nmB.at).getTime() : 0;
          cmp = timeA - timeB;
          break;
        }
        case 'reminder': {
          cmp = (a.nextContactDate || '').localeCompare(b.nextContactDate || '');
          break;
        }
      }
      return cmp * dirMul;
    });

    return rows;
  }, [filtered, sortField, sortDir, agentUsers]);

  const formatDateTime = (v?: any) => {
    const d = toSafeDate(v);
    if (!d) return '';
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDay = (s?: string) => {
    if (!s) return '';
    const d = new Date(`${s}T00:00:00`);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const todayStr = toDateInputValue(new Date());

  // ── ייצוא דוח — בדיוק מה שמוצג כרגע על המסך (אחרי סינון ומיון) ──
  const exportToExcel = async () => {
    if (!sorted.length || isExporting) return;
    setIsExporting(true);
    try {
      const headers = ['לקוח', 'ת"ז', 'טלפון', 'דירוג', 'אחראי', 'סטטוס תהליך', 'שיחה אחרונה', 'פגישה קרובה', 'תזכורת לשיחה'];

      const rows = sorted.map(c => {
        const tier = (c.customerTier || 'standard') as Tier;
        const stage = (c.meetingStage || 'not_started') as MeetingStage;
        const nm = getNextMeeting(c);
        return [
          `${c.firstNameCustomer ?? ''} ${c.lastNameCustomer ?? ''}`.trim(),
          c.IDCustomer || '',
          c.phone || '',
          TIER_LABEL[tier],
          c.responsibleUserName || getUserName(c.responsibleUserId) || '',
          getMeetingStageLabel(stage),
          formatDateTime(getLastContactDate(c)),
          nm ? `${nm.label}${formatDateTime(nm.at)}` : '',
          formatDay(c.nextContactDate),
        ];
      });

      const res = await apiFetch('/api/export-report', {
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

      {/* ── KPI: כמה לקוחות יש עכשיו בכל סטטוס (סכום הכרטיסים = סה"כ לקוחות) ── */}
      <div className="md-kpi-bar">
        <div className="md-kpi-head">
          <div className="md-kpi-title">לקוחות לפי סטטוס נוכחי</div>
          <div className="md-kpi-total">סה&quot;כ {scoped.length}</div>
          <div className="md-kpi-note">מושפע מסינון אחראי / דירוג / חיפוש. לחיצה על כרטיס מסננת את הטבלה.</div>
        </div>

        <div className="md-kpi-grid">
          {KPI_STAGES.map(stageKey => {
            const meta = MEETING_STAGE_META[stageKey];
            const tone = KPI_TONE_BY_KIND[meta.kind] ?? 'gray';
            const active = filterStage === stageKey;
            return (
              <button
                key={stageKey}
                type="button"
                className={`md-kpi-card md-kpi-${tone}${active ? ' md-kpi-active' : ''}`}
                onClick={() => { setRemindersOnly(false); setFilterStage(active ? 'all' : stageKey); }}
                title={active ? 'לחץ לביטול הסינון' : 'לחץ לסינון הטבלה'}
              >
                <div className="md-kpi-value">{stageCounts[stageKey] ?? 0}</div>
                <div className="md-kpi-label">{meta.icon} {meta.label}</div>
              </button>
            );
          })}
        </div>

        <div className="md-kpi-extra">
          <button
            type="button"
            className={`md-kpi-card md-kpi-orange${remindersOnly ? ' md-kpi-active' : ''}`}
            onClick={() => setRemindersOnly(v => !v)}
            title={remindersOnly ? 'לחץ לביטול הסינון' : 'לחץ לסינון הטבלה'}
          >
            <div className="md-kpi-value">{reminderCount}</div>
            <div className="md-kpi-label">📆 תזכורות שהגיע זמנן</div>
            <div className="md-kpi-sub">נכון להיום · לא סטטוס, נספר בנוסף</div>
          </button>
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
          <select className="md-select" value={filterStage} onChange={e => setFilterStage(e.target.value)}>
            <option value="all">הכל</option>
            {MEETING_STAGE_GROUPS.map(g => (
              <optgroup key={g.key} label={g.label}>
                <option value={`group:${g.key}`}>כל ה{g.label}</option>
                {(Object.keys(MEETING_STAGE_META) as MeetingStage[])
                  .filter(s => getStageGroup(s) === g.key)
                  .map(s => (
                    <option key={s} value={s}>{MEETING_STAGE_META[s].label}</option>
                  ))}
              </optgroup>
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
                  שיחה אחרונה {sortIndicator('contacted')}
                </th>
                <th className="md-th-sortable" onClick={() => handleSort('date')}>
                  פגישה קרובה {sortIndicator('date')}
                </th>
                <th className="md-th-sortable" onClick={() => handleSort('reminder')}>
                  תזכורת לשיחה {sortIndicator('reminder')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => {
                const tier = (c.customerTier || 'standard') as Tier;
                const stage = (c.meetingStage || 'not_started') as MeetingStage;
                const lastContact = getLastContactDate(c);
                const nm = getNextMeeting(c);
                const reminderDue = !!c.nextContactDate && c.nextContactDate <= todayStr;
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
                        {MEETING_STAGE_META[stage]?.icon} {getMeetingStageLabel(stage)}
                      </span>
                    </td>
                    <td>{lastContact ? formatDateTime(lastContact) : <span className="md-muted">—</span>}</td>
                    <td>{nm ? `${nm.label}${formatDateTime(nm.at)}` : <span className="md-muted">—</span>}</td>
                    <td>
                      {c.nextContactDate
                        ? <span className={reminderDue ? 'md-reminder-due' : ''}>{formatDay(c.nextContactDate)}</span>
                        : <span className="md-muted">—</span>}
                    </td>
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
