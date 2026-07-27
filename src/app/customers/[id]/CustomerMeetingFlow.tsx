'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { MeetingStage, MEETING_STAGE_META } from '@/lib/meetingStages';
import './CustomerMeetingFlow.css';

interface MeetingState {
  meetingStage: MeetingStage;
  meetingDate: string;
  meetingStageUpdatedAt: any;
  contactedAt: any;
}

interface Props {
  customerId: string;
  agentId: string;
}

const EMPTY_STATE: MeetingState = {
  meetingStage: 'not_started',
  meetingDate: '',
  meetingStageUpdatedAt: null,
  contactedAt: null,
};

// ── ממיר בבטחה Firestore Timestamp או מחרוזת ISO לאובייקט Date ──
const toSafeDate = (v: any): Date | null => {
  if (!v) return null;
  const d = typeof v?.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// ── ממיר Date לפורמט שמתאים ל-input type="datetime-local" ──
const toDatetimeLocalValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CustomerMeetingFlow({ customerId }: Props) {
  const [state, setState] = useState<MeetingState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dateDraft, setDateDraft] = useState('');
  const [showDateInput, setShowDateInput] = useState(false);

  // ── עריכה ידנית של "יצירת קשר אחרונה" ──
  const [editingContacted, setEditingContacted] = useState(false);
  const [contactedDraft, setContactedDraft] = useState('');

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
            contactedAt: d.contactedAt ?? null,
          });
          setDateDraft(d.meetingDate ?? '');
        }
      } finally {
        setLoading(false);
      }
    };
    if (customerId) load();
  }, [customerId]);

  const persist = async (patch: Partial<MeetingState>) => {
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

  // ── שלב 1: דיברתי עם הלקוח — נקודת מגע ← מעדכנת contactedAt ──
  const markContacted = () => persist({ meetingStage: 'contacted', contactedAt: serverTimestamp() });

  const chooseScheduled = () => setShowDateInput(true);

  const saveScheduledDate = () => {
    if (!dateDraft) return;
    persist({ meetingStage: 'scheduled', meetingDate: dateDraft });
    setShowDateInput(false);
  };

  const chooseNotInterested = () => persist({ meetingStage: 'not_interested', meetingDate: '' });

  // ── שלב 3: הפגישה התקיימה בפועל — גם כאן נקודת מגע ← מעדכנת contactedAt ──
  const markMeetingDone = () => persist({ meetingStage: 'meeting_done', contactedAt: serverTimestamp() });

  const resetProcess = () => {
    persist({ ...EMPTY_STATE });
    setShowDateInput(false);
    setDateDraft('');
    setEditingContacted(false);
  };

  const startEditContacted = () => {
    const d = toSafeDate(state.contactedAt) || new Date();
    setContactedDraft(toDatetimeLocalValue(d));
    setEditingContacted(true);
  };

  const saveContactedEdit = () => {
    if (!contactedDraft) return;
    persist({ contactedAt: new Date(contactedDraft).toISOString() });
    setEditingContacted(false);
  };

  const formatDate = (s: string) => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  const formatContactedAt = (v: any) => {
    const d = toSafeDate(v);
    if (!d) return '';
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

      {contactedDone && (
        <div className="cmf-status-line">
          <span className="cmf-status-ok">✓ {MEETING_STAGE_META.contacted.label}</span>

          {state.contactedAt && !editingContacted && (
            <div className="cmf-contacted-meta">
              יצירת קשר אחרונה: {formatContactedAt(state.contactedAt)}
              <button className="cmf-btn-edit-inline" onClick={startEditContacted}>ערוך</button>
            </div>
          )}

          {editingContacted && (
            <div className="cmf-contacted-edit">
              <input
                type="datetime-local"
                className="cmf-input cmf-input-sm"
                value={contactedDraft}
                onChange={e => setContactedDraft(e.target.value)}
                autoFocus
              />
              <button className="cmf-btn-primary cmf-btn-sm" onClick={saveContactedEdit} disabled={!contactedDraft || saving}>
                שמור
              </button>
              <button className="cmf-btn-cancel cmf-btn-sm" onClick={() => setEditingContacted(false)}>
                בטל
              </button>
            </div>
          )}
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
    </div>
  );
}
