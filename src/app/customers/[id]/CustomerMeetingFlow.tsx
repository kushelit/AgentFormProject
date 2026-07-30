'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { MeetingStage, MEETING_STAGE_META } from '@/lib/meetingStages';
import './CustomerMeetingFlow.css';

interface ContactLogEntry {
  at: string; // ISO string - arrayUnion לא תומך ב-serverTimestamp() בתוך מערך
  note?: string;
}

interface MeetingState {
  meetingStage: MeetingStage;
  meetingDate: string;
  meetingStageUpdatedAt: any;
  contactLog: ContactLogEntry[];
}

interface Props {
  customerId: string;
  agentId: string;
}

const EMPTY_STATE: MeetingState = {
  meetingStage: 'not_started',
  meetingDate: '',
  meetingStageUpdatedAt: null,
  contactLog: [],
};

const toSafeDate = (v: any): Date | null => {
  if (!v) return null;
  const d = typeof v?.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

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

export default function CustomerMeetingFlow({ customerId }: Props) {
  const [state, setState] = useState<MeetingState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dateDraft, setDateDraft] = useState('');
  const [showDateInput, setShowDateInput] = useState(false);

  // ── תיעוד שיחה חדשה — הטופס הזה עכשיו מוצג *בתוך* המודל תמיד ──
  const [loggingContact, setLoggingContact] = useState(false);
  const [contactNoteDraft, setContactNoteDraft] = useState('');

  // ── מודל היסטוריית שיחות ──
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingEntryIdx, setEditingEntryIdx] = useState<number | null>(null);
  const [editEntryDateDraft, setEditEntryDateDraft] = useState('');
  const [editEntryNoteDraft, setEditEntryNoteDraft] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'customer', customerId));
        if (snap.exists()) {
          const d = snap.data() as any;
          setState({
            meetingStage: (d.meetingStage as MeetingStage) ?? 'not_started',
            meetingDate: d.meetingDate ?? '',
            meetingStageUpdatedAt: d.meetingStageUpdatedAt ?? null,
            contactLog: Array.isArray(d.contactLog) ? d.contactLog : [],
          });
          setDateDraft(d.meetingDate ?? '');
        }
      } finally {
        setLoading(false);
      }
    };
    if (customerId) load();
  }, [customerId]);

  const persistStage = async (patch: Partial<Pick<MeetingState, 'meetingStage' | 'meetingDate'>>) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'customer', customerId), {
        ...patch,
        meetingStageUpdatedAt: serverTimestamp(),
      });
      setState(prev => ({ ...prev, ...patch }));
    } finally {
      setSaving(false);
    }
  };

  const appendContactEntry = async (entry: ContactLogEntry) => {
    await updateDoc(doc(db, 'customer', customerId), {
      contactLog: arrayUnion(entry),
    });
    setState(prev => ({ ...prev, contactLog: [...prev.contactLog, entry] }));
  };

  const markContacted = async () => {
    setSaving(true);
    try {
      const entry: ContactLogEntry = { at: new Date().toISOString() };
      await updateDoc(doc(db, 'customer', customerId), {
        meetingStage: 'contacted',
        meetingStageUpdatedAt: serverTimestamp(),
        contactLog: arrayUnion(entry),
      });
      setState(prev => ({ ...prev, meetingStage: 'contacted', contactLog: [...prev.contactLog, entry] }));
    } finally {
      setSaving(false);
    }
  };

  const chooseScheduled = () => setShowDateInput(true);

  const saveScheduledDate = () => {
    if (!dateDraft) return;
    persistStage({ meetingStage: 'scheduled', meetingDate: dateDraft });
    setShowDateInput(false);
  };

  const chooseNotInterested = () => persistStage({ meetingStage: 'not_interested', meetingDate: '' });

  const markMeetingDone = async () => {
    setSaving(true);
    try {
      const entry: ContactLogEntry = { at: new Date().toISOString() };
      await updateDoc(doc(db, 'customer', customerId), {
        meetingStage: 'meeting_done',
        meetingStageUpdatedAt: serverTimestamp(),
        contactLog: arrayUnion(entry),
      });
      setState(prev => ({ ...prev, meetingStage: 'meeting_done', contactLog: [...prev.contactLog, entry] }));
    } finally {
      setSaving(false);
    }
  };

  const resetProcess = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'customer', customerId), {
        meetingStage: 'not_started',
        meetingDate: '',
        meetingStageUpdatedAt: serverTimestamp(),
      });
      setState(prev => ({ ...prev, meetingStage: 'not_started', meetingDate: '' }));
    } finally {
      setSaving(false);
    }
    setShowDateInput(false);
    setDateDraft('');
    setLoggingContact(false);
    setContactNoteDraft('');
  };

  // ── פותח את המודל *עם* טופס ההוספה גלוי מיד (כפתור "תיעוד שיחה" החיצוני) ──
  const openLogContactModal = () => {
    setContactNoteDraft('');
    setLoggingContact(true);
    setHistoryOpen(true);
  };

  // ── פותח את טופס ההוספה בתוך מודל שכבר פתוח (כפתור "הוסף תיעוד שיחה") ──
  const openLogContactInline = () => {
    setContactNoteDraft('');
    setLoggingContact(true);
  };

  const saveLogContact = async () => {
    setSaving(true);
    try {
      const entry: ContactLogEntry = { at: new Date().toISOString() };
      if (contactNoteDraft.trim()) entry.note = contactNoteDraft.trim();
      await appendContactEntry(entry);
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
    setSaving(true);
    try {
      const updated: ContactLogEntry = { at: new Date(editEntryDateDraft).toISOString() };
      if (editEntryNoteDraft.trim()) updated.note = editEntryNoteDraft.trim();
      const newLog = [...state.contactLog];
      newLog[editingEntryIdx] = updated;
      await updateDoc(doc(db, 'customer', customerId), { contactLog: newLog });
      setState(prev => ({ ...prev, contactLog: newLog }));
    } finally {
      setSaving(false);
    }
    setEditingEntryIdx(null);
  };

  const deleteEntry = async (idx: number) => {
    setSaving(true);
    try {
      const newLog = state.contactLog.filter((_, i) => i !== idx);
      await updateDoc(doc(db, 'customer', customerId), { contactLog: newLog });
      setState(prev => ({ ...prev, contactLog: newLog }));
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (s: string) => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return <div className="cp-loading-inline">טוען...</div>;
  }

  const stage = state.meetingStage;
  const contactedDone = stage !== 'not_started';
  const outcomeSet = stage === 'scheduled' || stage === 'not_interested' || stage === 'meeting_done';
  const isScheduled = stage === 'scheduled';
  const isMeetingDone = stage === 'meeting_done';
  const isNotInterested = stage === 'not_interested';

  // ── ה"קשר אחרון" משוקלל מכל מקורות ההיסטוריה יחד: דיברתי/פגישה בוצעה/תיעוד ידני ──
  const sortedLog = [...state.contactLog].sort((a, b) => (a.at < b.at ? 1 : -1));
  const lastEntry = sortedLog[0];

  const closeHistory = () => {
    setHistoryOpen(false);
    setEditingEntryIdx(null);
    setLoggingContact(false);
  };

  return (
    <div className="cmf-wrap">
      {/* ── דיאגרמת תהליך ── */}
      <div className="cmf-diagram">
        <div className={`cmf-node${contactedDone ? ' cmf-node-done' : ' cmf-node-active'}`}>
          <div className="cmf-node-icon">{contactedDone ? '✓' : '1'}</div>
          <div className="cmf-node-label">{MEETING_STAGE_META.contacted.label}</div>
        </div>

        <div className={`cmf-connector${contactedDone ? ' cmf-connector-done' : ''}`} />

        <div className="cmf-branch">
          <div className="cmf-branch-col">
            <div className={`cmf-node cmf-node-branch${isScheduled || isMeetingDone ? ' cmf-node-done' : contactedDone && !outcomeSet ? ' cmf-node-active' : ''}`}>
              <div className="cmf-node-icon">{isScheduled || isMeetingDone ? '✓' : MEETING_STAGE_META.scheduled.icon}</div>
              <div className="cmf-node-label">{MEETING_STAGE_META.scheduled.label}</div>
            </div>

            {(isScheduled || isMeetingDone) && (
              <>
                <div className={`cmf-sub-connector${isMeetingDone ? ' cmf-connector-done' : ''}`} />
                <div className={`cmf-node cmf-node-sub${isMeetingDone ? ' cmf-node-done' : ' cmf-node-active'}`}>
                  <div className="cmf-node-icon">{isMeetingDone ? '✓' : MEETING_STAGE_META.meeting_done.icon}</div>
                  <div className="cmf-node-label">{MEETING_STAGE_META.meeting_done.label}</div>
                </div>
              </>
            )}
          </div>

          <div className={`cmf-node cmf-node-branch cmf-node-negative${isNotInterested ? ' cmf-node-done-negative' : contactedDone && !outcomeSet ? ' cmf-node-active' : ''}`}>
            <div className="cmf-node-icon">{isNotInterested ? '✕' : MEETING_STAGE_META.not_interested.icon}</div>
            <div className="cmf-node-label">{MEETING_STAGE_META.not_interested.label}</div>
          </div>
        </div>
      </div>

      {/* ── שלב 1: דיברתי עם הלקוח ── */}
      {!contactedDone && (
        <div className="cmf-action-box">
          <button className="cmf-btn-primary" onClick={markContacted} disabled={saving}>
            {saving ? 'שומר...' : `✓ סמן ש${MEETING_STAGE_META.contacted.label}`}
          </button>
        </div>
      )}

      {/* ── סטטוס + כפתורי פעולה ── */}
      {contactedDone && (
        <div className="cmf-status-line">
          <span className="cmf-status-ok">✓ {MEETING_STAGE_META.contacted.label}</span>

          {lastEntry && (
            <div className="cmf-contacted-meta">
              יצירת קשר אחרונה: {formatEntryDate(lastEntry.at)}
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

      {/* ── שלב 2: הסתעפות תוצאה ── */}
      {contactedDone && !outcomeSet && (
        <div className="cmf-action-box">
          <div className="cmf-question">מה תוצאת השיחה?</div>
          {!showDateInput ? (
            <div className="cmf-branch-actions">
              <button className="cmf-btn-primary" onClick={chooseScheduled} disabled={saving}>
                {MEETING_STAGE_META.scheduled.icon} {MEETING_STAGE_META.scheduled.label}
              </button>
              <button className="cmf-btn-negative" onClick={chooseNotInterested} disabled={saving}>
                {MEETING_STAGE_META.not_interested.icon} {MEETING_STAGE_META.not_interested.label}
              </button>
            </div>
          ) : (
            <div className="cmf-date-form">
              <label className="cmf-label">למתי?</label>
              <input
                type="datetime-local"
                className="cmf-input"
                value={dateDraft}
                onChange={e => setDateDraft(e.target.value)}
                autoFocus
              />
              <div className="cmf-branch-actions">
                <button className="cmf-btn-primary" onClick={saveScheduledDate} disabled={!dateDraft || saving}>
                  {saving ? 'שומר...' : 'שמור מועד'}
                </button>
                <button className="cmf-btn-cancel" onClick={() => setShowDateInput(false)}>בטל</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── מצב: תואמה פגישה (עדיין לא התקיימה) ── */}
      {isScheduled && (
        <div className="cmf-result cmf-result-positive">
          <div className="cmf-result-title">{MEETING_STAGE_META.scheduled.icon} נקבעה פגישה</div>
          <div className="cmf-result-date">{formatDate(state.meetingDate)}</div>
          <button className="cmf-btn-primary cmf-btn-meeting-done" onClick={markMeetingDone} disabled={saving}>
            {saving ? 'שומר...' : `✓ סמן ש${MEETING_STAGE_META.meeting_done.label}`}
          </button>
          <button className="cmf-btn-reset" onClick={resetProcess}>אפס תהליך</button>
        </div>
      )}

      {/* ── מצב סופי: הפגישה התקיימה ── */}
      {isMeetingDone && (
        <div className="cmf-result cmf-result-positive">
          <div className="cmf-result-title">{MEETING_STAGE_META.meeting_done.icon} {MEETING_STAGE_META.meeting_done.label}</div>
          <div className="cmf-result-date">{formatDate(state.meetingDate)}</div>
          <button className="cmf-btn-reset" onClick={resetProcess}>אפס תהליך</button>
        </div>
      )}

      {/* ── מצב סופי: לא מעוניין ── */}
      {isNotInterested && (
        <div className="cmf-result cmf-result-negative">
          <div className="cmf-result-title">{MEETING_STAGE_META.not_interested.icon} הלקוח לא מעוניין</div>
          <button className="cmf-btn-reset" onClick={resetProcess}>אפס תהליך</button>
        </div>
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

            {/* ── טופס הוספה — עכשיו בתוך המודל בפועל, לא מאחוריו ── */}
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