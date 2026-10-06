'use client';

import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import {
  MeetingStage,
  MEETING_STAGE_META,
  MEETING_STAGE_ORDER,
  DEFAULT_EXIT_FROM,
  STAGES_LOGGING_CONTACT,
  ContactLogEntry,
  StageHistoryEntry,
  isExitStage,
  isTerminalStage,
  computeNextContactDate,
  getStageEvents,
  toSafeDate,
} from '@/lib/meetingStages';
import './CustomerMeetingFlow.css';

interface MeetingState {
  meetingStage: MeetingStage;
  meetingDate: string;            // מועד פגישה ראשונה (datetime-local)
  recommendationsDate: string;    // מועד פגישת המלצות (datetime-local)
  meetingSummary: string;         // סיכום הפגישה
  meetingStageUpdatedAt: any;
  contactLog: ContactLogEntry[];
  stageHistory: StageHistoryEntry[];
  exitFromStage: MeetingStage | null;
  exitAt: string | null;
  exitReason: string;
  nextContactDate: string;        // "YYYY-MM-DD" — תזכורת לשיחה נוספת (תאריך בלבד, ללא יומן כרגע)
}

interface Props {
  customerId: string;
  agentId: string;
}

const EMPTY_STATE: MeetingState = {
  meetingStage: 'not_started',
  meetingDate: '',
  recommendationsDate: '',
  meetingSummary: '',
  meetingStageUpdatedAt: null,
  contactLog: [],
  stageHistory: [],
  exitFromStage: null,
  exitAt: null,
  exitReason: '',
  nextContactDate: '',
};

// נקודת היציאה שמסומנת מתחת לכל שלב בדיאגרמה
const EXIT_MARK_AFTER: Partial<Record<MeetingStage, MeetingStage>> = {
  contacted: 'not_interested',
  meeting_done: 'not_interested_followup',
  recommendations_meeting: 'not_interested_closing',
};

type DateMode = null | 'schedule' | 'reschedule_meeting' | 'recommendations' | 'reschedule_recommendations';

const toDatetimeLocalValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatEntryDate = (v: string) => {
  const d = toSafeDate(v);
  if (!d) return '';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
};

const formatDay = (s: string) => {
  if (!s) return '';
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const latestIso = (log: ContactLogEntry[]): string | null => {
  let best: string | null = null;
  for (const e of log) {
    if (e?.at && (!best || e.at > best)) best = e.at;
  }
  return best;
};

export default function CustomerMeetingFlow({ customerId }: Props) {
  const { user } = useAuth();
  const [state, setState] = useState<MeetingState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── טפסים פנימיים ──
  const [dateMode, setDateMode] = useState<DateMode>(null);
  const [dateDraft, setDateDraft] = useState('');
  const [summaryDraft, setSummaryDraft] = useState('');
  const [exitTarget, setExitTarget] = useState<MeetingStage | null>(null);
  const [exitReasonDraft, setExitReasonDraft] = useState('');
  const [nextContactDraft, setNextContactDraft] = useState('');

  // ── תיעוד שיחה חדשה — הטופס מוצג *בתוך* המודל תמיד ──
  const [loggingContact, setLoggingContact] = useState(false);
  const [contactNoteDraft, setContactNoteDraft] = useState('');

  // ── מודל היסטוריית שיחות ──
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingEntryIdx, setEditingEntryIdx] = useState<number | null>(null);
  const [editEntryDateDraft, setEditEntryDateDraft] = useState('');
  const [editEntryNoteDraft, setEditEntryNoteDraft] = useState('');

  const load = useCallback(async () => {
    const snap = await getDoc(doc(db, 'customer', customerId));
    if (!snap.exists()) return;
    const d = snap.data() as any;
    setState({
      meetingStage: (d.meetingStage as MeetingStage) ?? 'not_started',
      meetingDate: d.meetingDate ?? '',
      recommendationsDate: d.recommendationsDate ?? '',
      meetingSummary: d.meetingSummary ?? '',
      meetingStageUpdatedAt: d.meetingStageUpdatedAt ?? null,
      contactLog: Array.isArray(d.contactLog) ? d.contactLog : [],
      stageHistory: Array.isArray(d.stageHistory) ? d.stageHistory : [],
      exitFromStage: d.exitFromStage ?? null,
      exitAt: d.exitAt ?? null,
      exitReason: d.exitReason ?? '',
      nextContactDate: d.nextContactDate ?? '',
    });
    setSummaryDraft(d.meetingSummary ?? '');
    setNextContactDraft(d.nextContactDate ?? '');
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [customerId, load]);

  // ══════════ מעבר שלב — הנקודה היחידה שמשנה את meetingStage ══════════
  // כותב בבת אחת: השלב, היסטוריית שלבים, נתוני יציאה, תזכורת לשיחה נוספת (בסיום מסלול) ושיחה אחרונה.
  const transition = async (
    stage: MeetingStage,
    extra: Record<string, any> = {},
    opts: { logContact?: boolean } = {},
  ) => {
    setSaving(true);
    try {
      const now = new Date();
      const iso = now.toISOString();
      const historyEntry: StageHistoryEntry = { stage, at: iso };
      if (user?.uid) historyEntry.by = user.uid;

      const payload: Record<string, any> = {
        meetingStage: stage,
        meetingStageUpdatedAt: serverTimestamp(),
        stageHistory: arrayUnion(historyEntry),
        // בסיום מסלול (יציאה או סוף העץ) — תמיד תזכורת לשיחה נוספת בעוד שנה; בחזרה למסלול — מתבטלת
        nextContactDate: isTerminalStage(stage) ? computeNextContactDate(now) : null,
        exitFromStage: null,
        exitAt: null,
        exitReason: null,
      };

      if (isExitStage(stage)) {
        payload.exitFromStage = state.meetingStage;
        payload.exitAt = iso;
        payload.exitReason = extra.exitReason ?? '';
      }

      const shouldLogContact = opts.logContact ?? STAGES_LOGGING_CONTACT.includes(stage);
      if (shouldLogContact) {
        payload.contactLog = arrayUnion({ at: iso } as ContactLogEntry);
        payload.lastContactAt = iso;
      }

      await updateDoc(doc(db, 'customer', customerId), { ...payload, ...extra });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const updateFields = async (fields: Record<string, any>) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'customer', customerId), fields);
      await load();
    } finally {
      setSaving(false);
    }
  };

  // ══════════ פעולות ══════════
  const markContacted = () => transition('contacted');

  const openDateForm = (mode: Exclude<DateMode, null>, current = '') => {
    setDateDraft(current);
    setDateMode(mode);
  };

  const saveDate = async () => {
    if (!dateDraft || !dateMode) return;
    const mode = dateMode;
    if (mode === 'schedule') await transition('scheduled', { meetingDate: dateDraft });
    else if (mode === 'reschedule_meeting') await updateFields({ meetingDate: dateDraft });
    else if (mode === 'recommendations') await transition('recommendations_meeting', { recommendationsDate: dateDraft });
    else if (mode === 'reschedule_recommendations') await updateFields({ recommendationsDate: dateDraft });
    setDateMode(null);
  };

  const startExit = (target: MeetingStage) => {
    setDateMode(null);
    setExitReasonDraft('');
    setExitTarget(target);
  };

  const confirmExit = async () => {
    if (!exitTarget) return;
    const extra: Record<string, any> = { exitReason: exitReasonDraft.trim() };
    // יציאה מתוך שלב הסיכום שומרת גם את הסיכום שהוקלד
    if (state.meetingStage === 'meeting_done') extra.meetingSummary = summaryDraft.trim();
    await transition(exitTarget, extra);
    setExitTarget(null);
  };

  const continueAfterSummary = () =>
    transition('portfolio_analysis', { meetingSummary: summaryDraft.trim() });

  const resumeFromExit = () => {
    const back = state.exitFromStage ?? DEFAULT_EXIT_FROM[state.meetingStage] ?? 'contacted';
    return transition(back, {}, { logContact: false });
  };

  const resetProcess = async () => {
    if (!window.confirm('לאפס את התהליך? הסיכום, המועדים והתזכורת יימחקו (יומן השיחות וההיסטוריה נשארים).')) return;
    await transition('not_started', { meetingDate: '', recommendationsDate: '', meetingSummary: '' });
    setDateMode(null);
    setExitTarget(null);
    setLoggingContact(false);
    setContactNoteDraft('');
  };

  const saveNextContact = () => updateFields({ nextContactDate: nextContactDraft || null });

  // ══════════ יומן שיחות ══════════
  const openLogContactModal = () => {
    setContactNoteDraft('');
    setLoggingContact(true);
    setHistoryOpen(true);
  };

  const openLogContactInline = () => {
    setContactNoteDraft('');
    setLoggingContact(true);
  };

  const saveLogContact = async () => {
    setSaving(true);
    try {
      const entry: ContactLogEntry = { at: new Date().toISOString() };
      if (contactNoteDraft.trim()) entry.note = contactNoteDraft.trim();
      await updateDoc(doc(db, 'customer', customerId), {
        contactLog: arrayUnion(entry),
        lastContactAt: entry.at,
      });
      await load();
    } finally {
      setSaving(false);
    }
    setLoggingContact(false);
    setContactNoteDraft('');
  };

  const startEditEntry = (idx: number) => {
    const entry = state.contactLog[idx];
    const d = toSafeDate(entry.at) || new Date();
    setEditEntryDateDraft(toDatetimeLocalValue(d));
    setEditEntryNoteDraft(entry.note ?? '');
    setEditingEntryIdx(idx);
  };

  const saveEditEntry = async () => {
    if (editingEntryIdx === null || !editEntryDateDraft) return;
    const updated: ContactLogEntry = { at: new Date(editEntryDateDraft).toISOString() };
    if (editEntryNoteDraft.trim()) updated.note = editEntryNoteDraft.trim();
    const newLog = [...state.contactLog];
    newLog[editingEntryIdx] = updated;
    await updateFields({ contactLog: newLog, lastContactAt: latestIso(newLog) });
    setEditingEntryIdx(null);
  };

  const deleteEntry = async (idx: number) => {
    const newLog = state.contactLog.filter((_, i) => i !== idx);
    await updateFields({ contactLog: newLog, lastContactAt: latestIso(newLog) });
  };

  if (loading) {
    return <div className="cp-loading-inline">טוען...</div>;
  }

  // ══════════ נגזרות תצוגה ══════════
  const stage = state.meetingStage;
  const meta = MEETING_STAGE_META[stage] ?? MEETING_STAGE_META.not_started;
  const started = stage !== 'not_started';
  const terminal = isTerminalStage(stage);
  const exited = isExitStage(stage);

  // עד איזה שלב במסלול הראשי הלקוח התקדם (ביציאה — השלב שממנו יצא)
  const progressStage: MeetingStage = exited
    ? (state.exitFromStage ?? DEFAULT_EXIT_FROM[stage] ?? 'contacted')
    : stage;
  const progressIdx = Math.max(0, MEETING_STAGE_ORDER.indexOf(progressStage));
  const pathNodes = MEETING_STAGE_ORDER.slice(1);

  const sortedLog = [...state.contactLog].sort((a, b) => (a.at < b.at ? 1 : -1));
  const lastEntry = sortedLog[0];

  const events = getStageEvents(state)
    .filter(e => e.stage !== 'not_started')
    .slice()
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  const closeHistory = () => {
    setHistoryOpen(false);
    setEditingEntryIdx(null);
    setLoggingContact(false);
  };

  // ══════════ בלוקים ══════════
  const renderDateForm = (label: string) => (
    <div className="cmf-date-form">
      <label className="cmf-label">{label}</label>
      <input
        type="datetime-local"
        className="cmf-input"
        value={dateDraft}
        onChange={e => setDateDraft(e.target.value)}
        autoFocus
      />
      <div className="cmf-branch-actions">
        <button className="cmf-btn-primary" onClick={saveDate} disabled={!dateDraft || saving}>
          {saving ? 'שומר...' : 'שמור מועד'}
        </button>
        <button className="cmf-btn-cancel" onClick={() => setDateMode(null)}>בטל</button>
      </div>
    </div>
  );

  const renderExitButton = (target: MeetingStage, disabled = false) => (
    <button className="cmf-btn-negative" onClick={() => startExit(target)} disabled={saving || disabled}>
      {MEETING_STAGE_META[target].icon} {MEETING_STAGE_META[target].label}
    </button>
  );

  const renderExitForm = () => exitTarget && (
    <div className="cmf-action-box cmf-action-box-exit">
      <div className="cmf-question">
        יציאה מהמסלול: {MEETING_STAGE_META[exitTarget].icon} {MEETING_STAGE_META[exitTarget].label}
      </div>
      <input
        type="text"
        className="cmf-input cmf-input-wide"
        placeholder="סיבה (לא חובה)"
        value={exitReasonDraft}
        onChange={e => setExitReasonDraft(e.target.value)}
        autoFocus
      />
      <div className="cmf-hint">תיקבע אוטומטית תזכורת לשיחה נוספת בעוד שנה</div>
      <div className="cmf-branch-actions">
        <button className="cmf-btn-negative-solid" onClick={confirmExit} disabled={saving}>
          {saving ? 'שומר...' : 'אשר יציאה'}
        </button>
        <button className="cmf-btn-cancel" onClick={() => setExitTarget(null)}>בטל</button>
      </div>
    </div>
  );

  const renderReminder = () => (
    <div className="cmf-reminder">
      <span className="cmf-reminder-label">📆 תזכורת לשיחה נוספת</span>
      <input
        type="date"
        className="cmf-input cmf-input-sm"
        value={nextContactDraft}
        onChange={e => setNextContactDraft(e.target.value)}
      />
      {nextContactDraft !== state.nextContactDate && (
        <button className="cmf-btn-primary cmf-btn-sm" onClick={saveNextContact} disabled={saving}>עדכן</button>
      )}
    </div>
  );

  const renderStageActions = () => {
    switch (stage) {
      case 'not_started':
        return (
          <div className="cmf-action-box">
            <button className="cmf-btn-primary" onClick={markContacted} disabled={saving}>
              {saving ? 'שומר...' : `✓ סמן ש${MEETING_STAGE_META.contacted.label}`}
            </button>
          </div>
        );

      case 'contacted':
        return (
          <div className="cmf-action-box">
            <div className="cmf-question">מה תוצאת השיחה?</div>
            {dateMode === 'schedule' ? renderDateForm('למתי?') : (
              <div className="cmf-branch-actions">
                <button className="cmf-btn-primary" onClick={() => openDateForm('schedule')} disabled={saving}>
                  {MEETING_STAGE_META.scheduled.icon} {MEETING_STAGE_META.scheduled.label}
                </button>
                {renderExitButton('not_interested')}
              </div>
            )}
          </div>
        );

      case 'scheduled':
        return (
          <div className="cmf-result cmf-result-progress">
            <div className="cmf-result-title">{MEETING_STAGE_META.scheduled.icon} נקבעה פגישה</div>
            {dateMode === 'reschedule_meeting' ? renderDateForm('מועד חדש') : (
              <>
                <div className="cmf-result-date">{formatEntryDate(state.meetingDate)}</div>
                <div className="cmf-branch-actions cmf-actions-top">
                  <button className="cmf-btn-primary" onClick={() => transition('meeting_done')} disabled={saving}>
                    {saving ? 'שומר...' : `✓ סמן ש${MEETING_STAGE_META.meeting_done.label}`}
                  </button>
                  <button
                    className="cmf-btn-contact-action cmf-btn-compact"
                    onClick={() => openDateForm('reschedule_meeting', state.meetingDate)}
                    disabled={saving}
                  >
                    🗓 שנה מועד
                  </button>
                  {renderExitButton('not_interested')}
                </div>
              </>
            )}
          </div>
        );

      case 'meeting_done':
        return (
          <div className="cmf-action-box cmf-action-box-wide">
            <div className="cmf-question">סיכום הפגישה והחלטת הלקוח</div>
            <textarea
              className="cmf-textarea"
              placeholder="סיכום הפגישה (חובה לפני בחירת המשך)"
              value={summaryDraft}
              onChange={e => setSummaryDraft(e.target.value)}
              rows={4}
            />
            <div className="cmf-branch-actions">
              <button
                className="cmf-btn-primary"
                onClick={continueAfterSummary}
                disabled={saving || !summaryDraft.trim()}
              >
                {saving ? 'שומר...' : `מעוניין בהמשך — ${MEETING_STAGE_META.portfolio_analysis.label}`}
              </button>
              {renderExitButton('not_interested_followup', !summaryDraft.trim())}
            </div>
          </div>
        );

      case 'portfolio_analysis':
        return (
          <div className="cmf-action-box">
            <div className="cmf-question">התיק בניתוח אצל איש המכירות</div>
            {dateMode === 'recommendations' ? renderDateForm('מועד פגישת ההמלצות') : (
              <div className="cmf-branch-actions">
                <button className="cmf-btn-primary" onClick={() => openDateForm('recommendations')} disabled={saving}>
                  ✓ הניתוח הושלם — קבע פגישת המלצות
                </button>
                {renderExitButton('not_interested_followup')}
              </div>
            )}
          </div>
        );

      case 'recommendations_meeting':
        return (
          <div className="cmf-result cmf-result-progress">
            <div className="cmf-result-title">{MEETING_STAGE_META.recommendations_meeting.icon} פגישת המלצות</div>
            {dateMode === 'reschedule_recommendations' ? renderDateForm('מועד חדש') : (
              <>
                <div className="cmf-result-date">{formatEntryDate(state.recommendationsDate)}</div>
                <button
                  className="cmf-btn-contact-action cmf-btn-compact"
                  onClick={() => openDateForm('reschedule_recommendations', state.recommendationsDate)}
                  disabled={saving}
                >
                  🗓 שנה מועד
                </button>
                <div className="cmf-question cmf-question-spaced">החלטת הלקוח אחרי ההמלצות</div>
                <div className="cmf-branch-actions">
                  <button className="cmf-btn-primary" onClick={() => transition('closing_interested')} disabled={saving}>
                    {saving ? 'שומר...' : `${MEETING_STAGE_META.closing_interested.icon} ${MEETING_STAGE_META.closing_interested.label}`}
                  </button>
                  {renderExitButton('not_interested_closing')}
                </div>
              </>
            )}
          </div>
        );

      case 'closing_interested':
        return (
          <div className="cmf-result cmf-result-positive">
            <div className="cmf-result-title">{meta.icon} {meta.label}</div>
            <div className="cmf-hint">השלב הבא (פתיחת הצעה בניהול עסקאות) יתווסף בהמשך</div>
            {renderReminder()}
            <button className="cmf-btn-reset" onClick={resetProcess}>אפס תהליך</button>
          </div>
        );

      default: // יציאות
        return (
          <div className="cmf-result cmf-result-negative">
            <div className="cmf-result-title">{meta.icon} {meta.label}</div>
            {state.exitAt && <div className="cmf-hint">יצא מהמסלול ב-{formatEntryDate(state.exitAt)}</div>}
            {state.exitReason && <div className="cmf-exit-reason">סיבה: {state.exitReason}</div>}
            {renderReminder()}
            <div className="cmf-branch-actions cmf-actions-top">
              <button className="cmf-btn-contact-action cmf-btn-compact" onClick={resumeFromExit} disabled={saving}>
                ↩ החזר למסלול
              </button>
            </div>
            <button className="cmf-btn-reset" onClick={resetProcess}>אפס תהליך</button>
          </div>
        );
    }
  };

  return (
    <div className="cmf-wrap">
      {/* ── דיאגרמת מסלול ── */}
      <div className="cmf-diagram">
        {pathNodes.map((s, n) => {
          const idx = MEETING_STAGE_ORDER.indexOf(s);
          const reached = idx <= progressIdx && started;
          const isNext = !terminal && idx === progressIdx + 1 && started
            || (!started && idx === 1);
          const nodeMeta = MEETING_STAGE_META[s];
          const exitStage = EXIT_MARK_AFTER[s];
          const exitTaken = !!exitStage && stage === exitStage;
          return (
            <div key={s} className="cmf-step">
              {n > 0 && <div className={`cmf-connector${reached ? ' cmf-connector-done' : ''}`} />}
              <div className="cmf-node-col">
                <div className={`cmf-node${reached ? ' cmf-node-done' : isNext ? ' cmf-node-active' : ''}`}>
                  <div className="cmf-node-icon">{reached ? '✓' : nodeMeta.icon}</div>
                  <div className="cmf-node-label">{nodeMeta.label}</div>
                </div>
                {exitStage && (
                  <div className={`cmf-exit-mark${exitTaken ? ' cmf-exit-mark-taken' : ''}`}>
                    <span className="cmf-exit-mark-line" />
                    <span className="cmf-exit-mark-label">✕ {MEETING_STAGE_META[exitStage].label}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── סטטוס + כפתורי פעולה ── */}
      {started && (
        <div className="cmf-status-line">
          <span className="cmf-status-ok">✓ {MEETING_STAGE_META.contacted.label}</span>

          {lastEntry && (
            <div className="cmf-contacted-meta">
              שיחה אחרונה: {formatEntryDate(lastEntry.at)}
              {lastEntry.note && ` — ${lastEntry.note}`}
            </div>
          )}

          <div className="cmf-contact-actions">
            <button className="cmf-btn-contact-action" onClick={openLogContactModal} disabled={saving}>
              📞 תיעוד שיחה
            </button>
            <button className="cmf-btn-contact-action" onClick={() => setHistoryOpen(true)}>
              🕐 שיחות מתועדות{sortedLog.length > 0 ? ` (${sortedLog.length})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* ── פעולות השלב הנוכחי (או טופס יציאה) ── */}
      {exitTarget ? renderExitForm() : renderStageActions()}

      {/* ── סיכום הפגישה (לקריאה בלבד אחרי שנשמר) ── */}
      {state.meetingSummary && stage !== 'meeting_done' && started && (
        <div className="cmf-summary-card">
          <div className="cmf-summary-title">סיכום הפגישה</div>
          <div className="cmf-summary-text">{state.meetingSummary}</div>
        </div>
      )}

      {/* ── איפוס (במצבי ביניים; במצבים סופיים הכפתור בתוך הכרטיס) ── */}
      {started && !terminal && !exitTarget && (
        <button className="cmf-btn-reset" onClick={resetProcess}>אפס תהליך</button>
      )}

      {/* ── היסטוריית שלבים ── */}
      {events.length > 0 && (
        <details className="cmf-stage-history">
          <summary>היסטוריית שלבים ({events.length})</summary>
          <ul>
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span>{MEETING_STAGE_META[e.stage]?.icon} {MEETING_STAGE_META[e.stage]?.label ?? e.stage}</span>
                <span className="cmf-stage-history-date">{formatEntryDate(e.at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* ── מודל: היסטוריית שיחות ── */}
      {historyOpen && (
        <div className="cmf-modal-overlay" onClick={closeHistory}>
          <div className="cmf-modal" onClick={e => e.stopPropagation()}>
            <div className="cmf-modal-header">
              <span>שיחות מתועדות</span>
              <button className="cmf-modal-close" onClick={closeHistory} aria-label="סגור">✕</button>
            </div>

            <div className="cmf-modal-body">
              {sortedLog.length === 0 ? (
                <div className="cmf-modal-empty">אין עדיין שיחות מתועדות</div>
              ) : (
                sortedLog.map(entry => {
                  const realIdx = state.contactLog.indexOf(entry);
                  const isEditing = editingEntryIdx === realIdx;
                  return (
                    <div key={realIdx} className="cmf-modal-row">
                      {isEditing ? (
                        <div className="cmf-modal-row-edit">
                          <input
                            type="datetime-local"
                            className="cmf-input cmf-input-sm"
                            value={editEntryDateDraft}
                            onChange={e => setEditEntryDateDraft(e.target.value)}
                          />
                          <input
                            type="text"
                            className="cmf-input cmf-input-sm"
                            placeholder="הערה (לא חובה)"
                            value={editEntryNoteDraft}
                            onChange={e => setEditEntryNoteDraft(e.target.value)}
                          />
                          <div className="cmf-modal-row-edit-actions">
                            <button className="cmf-btn-primary cmf-btn-sm" onClick={saveEditEntry} disabled={saving}>שמור</button>
                            <button className="cmf-btn-cancel cmf-btn-sm" onClick={() => setEditingEntryIdx(null)}>בטל</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="cmf-modal-row-info">
                            <span className="cmf-modal-row-date">{formatEntryDate(entry.at)}</span>
                            {entry.note && <span className="cmf-modal-row-note">{entry.note}</span>}
                          </div>
                          <div className="cmf-modal-row-actions">
                            <button className="cmf-btn-edit-inline" onClick={() => startEditEntry(realIdx)}>ערוך</button>
                            <button className="cmf-btn-edit-inline" onClick={() => deleteEntry(realIdx)}>מחק</button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="cmf-modal-footer">
              {loggingContact ? (
                <div className="cmf-modal-add-form">
                  <input
                    type="text"
                    className="cmf-input cmf-input-sm"
                    placeholder="הערה (לא חובה)"
                    value={contactNoteDraft}
                    onChange={e => setContactNoteDraft(e.target.value)}
                    autoFocus
                  />
                  <div className="cmf-modal-row-edit-actions">
                    <button className="cmf-btn-primary cmf-btn-sm" onClick={saveLogContact} disabled={saving}>
                      {saving ? 'שומר...' : 'שמור'}
                    </button>
                    <button className="cmf-btn-cancel cmf-btn-sm" onClick={() => setLoggingContact(false)}>
                      בטל
                    </button>
                  </div>
                </div>
              ) : (
                <button className="cmf-btn-contact-action" onClick={openLogContactInline} disabled={saving}>
                  📞 הוסף תיעוד שיחה
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
