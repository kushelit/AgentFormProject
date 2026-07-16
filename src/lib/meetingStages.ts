// lib/meetingStages.ts
//
// הגדרת שלבי תהליך תיאום הפגישה — מקור אמת יחיד.
// כדי להוסיף שלב חדש בעתיד (למשל "הוזמנו מסמכים", "התקיימה פגישה"):
// 1. הוסיפי ערך ל-MeetingStage
// 2. הוסיפי שורה ל-MEETING_STAGE_META
// 3. אם השלב הוא באמצע התהליך (לא מצב סופי) — הוסיפי אותו גם ל-MEETING_STAGE_ORDER
// אין צורך לגעת בדף הריכוז (MeetingsDashboard) — הוא קורא מהרשימה הזו אוטומטית.

export type MeetingStage =
  | 'not_started'      // עדיין לא נוצר קשר
  | 'contacted'         // דיברתי עם הלקוח
  | 'scheduled'         // תואמה פגישה
  | 'not_interested';   // לא מעוניין (מצב סופי שלילי)

export interface MeetingStageMeta {
  label: string;
  icon: string;
  isFinal: boolean;      // מצב סופי — לא ממשיכים ממנו בתהליך הרגיל
  isNegative: boolean;   // מצב סופי שלילי — צביעה אדומה בכל מקום שמציג את זה
}

export const MEETING_STAGE_META: Record<MeetingStage, MeetingStageMeta> = {
  not_started:    { label: 'טרם נוצר קשר', icon: '—',  isFinal: false, isNegative: false },
  contacted:      { label: 'דיברתי עם הלקוח', icon: '💬', isFinal: false, isNegative: false },
  scheduled:      { label: 'תואמה פגישה', icon: '📅', isFinal: true,  isNegative: false },
  not_interested: { label: 'לא מעוניין', icon: '🚫', isFinal: true,  isNegative: true },
};

// הסדר הרגיל (הליניארי) של התהליך, לא כולל מצבים סופיים שליליים כמו "לא מעוניין"
// (זה מה שמציגים בדיאגרמת השלבים ובדף הריכוז לצורך מיון/פילטור)
export const MEETING_STAGE_ORDER: MeetingStage[] = [
  'not_started',
  'contacted',
  'scheduled',
];

export const getMeetingStageLabel = (stage?: string | null): string => {
  if (!stage) return MEETING_STAGE_META.not_started.label;
  return MEETING_STAGE_META[stage as MeetingStage]?.label ?? stage;
};