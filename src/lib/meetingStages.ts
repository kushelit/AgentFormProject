// lib/meetingStages.ts
//
// הגדרת שלבי מסע הלקוח (תיאום פגישה → ניתוח תיק → פגישת המלצות → סגירה) — מקור אמת יחיד.
// המסלול (CustomerMeetingFlow) והדשבורד (MeetingsDashboard) קוראים מכאן.
//
// מבנה העץ:
//   not_started → contacted ─┬─ not_interested (יציאה 1)
//                            └─ scheduled ─┬─ not_interested (יציאה 1)
//                                          └─ meeting_done ─┬─ not_interested_followup (יציאה 2)
//                                                           └─ portfolio_analysis ─┬─ not_interested_followup (יציאה 2)
//                                                                                  └─ recommendations_meeting ─┬─ not_interested_closing (יציאה 3)
//                                                                                                              └─ closing_interested (סוף העץ כרגע)
//
// כדי להוסיף שלב בעתיד: ערך ב-MeetingStage, שורה ב-MEETING_STAGE_META,
// ואם הוא חלק מהמסלול הראשי — גם ב-MEETING_STAGE_ORDER; אם הוא יציאה — גם ב-EXIT_STAGES + DEFAULT_EXIT_FROM.

export type MeetingStage =
  | 'not_started'              // עדיין לא נוצר קשר
  | 'contacted'                // שיחה בוצעה
  | 'scheduled'                // תואמה פגישה
  | 'meeting_done'             // הפגישה התקיימה (ממתין לסיכום והחלטה)
  | 'portfolio_analysis'       // ניתוח תיק אצל איש מכירות
  | 'recommendations_meeting'  // פגישת המלצות (תאריך + החלטה)
  | 'closing_interested'       // מעוניין בסגירה — סוף העץ הנוכחי
  | 'not_interested'           // יציאה 1: לא מעוניין בפגישה
  | 'not_interested_followup'  // יציאה 2: לא מעוניין בהמשך (אחרי פגישה / ניתוח תיק)
  | 'not_interested_closing';  // יציאה 3: לא מעוניין בסגירה

// active = שלב בדרך; exit = נקודת יציאה מהמסלול; success = סוף המסלול החיובי
export type MeetingStageKind = 'pending' | 'active' | 'exit' | 'success';

export interface MeetingStageMeta {
  label: string;
  icon: string;
  kind: MeetingStageKind;
}

export const MEETING_STAGE_META: Record<MeetingStage, MeetingStageMeta> = {
  not_started:             { label: 'טרם נוצר קשר',      icon: '—',  kind: 'pending' },
  contacted:               { label: 'דיברתי עם הלקוח',   icon: '💬', kind: 'active' },
  scheduled:               { label: 'תואמה פגישה',        icon: '📅', kind: 'active' },
  meeting_done:            { label: 'הפגישה התקיימה',     icon: '🤝', kind: 'active' },
  portfolio_analysis:      { label: 'ניתוח תיק',          icon: '📊', kind: 'active' },
  recommendations_meeting: { label: 'פגישת המלצות',       icon: '📝', kind: 'active' },
  closing_interested:      { label: 'מעוניין בסגירה',     icon: '✅', kind: 'success' },
  not_interested:          { label: 'לא מעוניין בפגישה',  icon: '🚫', kind: 'exit' },
  not_interested_followup: { label: 'לא מעוניין בהמשך',   icon: '🚫', kind: 'exit' },
  not_interested_closing:  { label: 'לא מעוניין בסגירה',  icon: '🚫', kind: 'exit' },
};

// המסלול הראשי (ליניארי) — מה שמוצג בדיאגרמה ומשמש לדירוג/מיון
export const MEETING_STAGE_ORDER: MeetingStage[] = [
  'not_started',
  'contacted',
  'scheduled',
  'meeting_done',
  'portfolio_analysis',
  'recommendations_meeting',
  'closing_interested',
];

export const EXIT_STAGES: MeetingStage[] = [
  'not_interested',
  'not_interested_followup',
  'not_interested_closing',
];

// מאיזה שלב "יצא" הלקוח כשאין מידע מפורש (לקוחות ישנים שיצאו לפני שנשמר exitFromStage)
export const DEFAULT_EXIT_FROM: Record<string, MeetingStage> = {
  not_interested: 'contacted',
  not_interested_followup: 'meeting_done',
  not_interested_closing: 'recommendations_meeting',
};

export const isExitStage = (stage?: string | null): boolean =>
  !!stage && MEETING_STAGE_META[stage as MeetingStage]?.kind === 'exit';

// סיום מסלול = יציאה או הצלחה (סוף העץ הנוכחי). בשניהם נקבעת תזכורת לשיחה נוספת.
export const isTerminalStage = (stage?: string | null): boolean => {
  const kind = stage ? MEETING_STAGE_META[stage as MeetingStage]?.kind : undefined;
  return kind === 'exit' || kind === 'success';
};

// שלבים שמוסיפים אוטומטית רשומת "שיחה" ליומן השיחות
export const STAGES_LOGGING_CONTACT: MeetingStage[] = ['contacted', 'meeting_done'];

export const getMeetingStageLabel = (stage?: string | null): string => {
  if (!stage) return MEETING_STAGE_META.not_started.label;
  return MEETING_STAGE_META[stage as MeetingStage]?.label ?? stage;
};

// ── קבוצות לסינון בדשבורד ──
export type MeetingStageGroup = 'in_progress' | 'exited' | 'closing';

export const MEETING_STAGE_GROUPS: { key: MeetingStageGroup; label: string }[] = [
  { key: 'in_progress', label: 'בתהליך' },
  { key: 'closing',     label: 'מעוניינים בסגירה' },
  { key: 'exited',      label: 'יצאו מהמסלול' },
];

export const getStageGroup = (stage?: string | null): MeetingStageGroup => {
  const kind = MEETING_STAGE_META[(stage || 'not_started') as MeetingStage]?.kind;
  if (kind === 'exit') return 'exited';
  if (kind === 'success') return 'closing';
  return 'in_progress';
};

// ══════════ תזכורת לשיחה נוספת ══════════
// כרגע רק תאריך (nextContactDate, "YYYY-MM-DD") שאפשר לקרוא ממנו בהמשך (יומן / MagicTouch).
export const REMINDER_MONTHS = 12;

const pad2 = (n: number) => String(n).padStart(2, '0');

export const toDateInputValue = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const computeNextContactDate = (from: Date = new Date()): string => {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + REMINDER_MONTHS);
  if (d.getDate() !== day) d.setDate(0); // 29.2 → 28.2 ולא 1.3
  return toDateInputValue(d);
};

// ══════════ אירועים והיסטוריה ══════════
export interface ContactLogEntry {
  at: string; // ISO string - arrayUnion לא תומך ב-serverTimestamp() בתוך מערך
  note?: string;
}

// רשומה בכל מעבר שלב — הבסיס ל-KPI מצטבר לפי תקופה
export interface StageHistoryEntry {
  stage: MeetingStage;
  at: string; // ISO
  by?: string; // uid של מי ששינה
}

export const toSafeDate = (v: any): Date | null => {
  if (!v) return null;
  const d = typeof v?.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

// השיחה האחרונה: השדה המפורש lastContactAt, ואם אין (לקוחות ישנים) — המאוחרת ביומן השיחות
export const getLastContactDate = (c: { lastContactAt?: any; contactLog?: ContactLogEntry[] }): Date | null => {
  const explicit = toSafeDate(c.lastContactAt);
  if (explicit) return explicit;
  let best: Date | null = null;
  for (const e of c.contactLog ?? []) {
    const d = toSafeDate(e?.at);
    if (d && (!best || d > best)) best = d;
  }
  return best;
};

// אירועי שלב ללקוח. ללקוחות ישנים (לפני stageHistory) משחזרים קירוב מהנתונים הקיימים.
export const getStageEvents = (c: {
  meetingStage?: string;
  meetingStageUpdatedAt?: any;
  stageHistory?: StageHistoryEntry[];
  contactLog?: ContactLogEntry[];
}): StageHistoryEntry[] => {
  if (Array.isArray(c.stageHistory) && c.stageHistory.length > 0) return c.stageHistory;

  const stage = (c.meetingStage || 'not_started') as MeetingStage;
  if (stage === 'not_started' || !MEETING_STAGE_META[stage]) return [];

  const updatedAt = toSafeDate(c.meetingStageUpdatedAt)?.toISOString();
  let firstContact: string | undefined;
  for (const e of c.contactLog ?? []) {
    if (e?.at && (!firstContact || e.at < firstContact)) firstContact = e.at;
  }

  const events: StageHistoryEntry[] = [];
  const contactedAt = firstContact ?? updatedAt;
  if (contactedAt) events.push({ stage: 'contacted', at: contactedAt });
  if (stage === 'meeting_done' && updatedAt) events.push({ stage: 'scheduled', at: updatedAt });
  if (stage !== 'contacted' && updatedAt) events.push({ stage, at: updatedAt });
  return events;
};
