// src/lib/adminQuestions/types.ts
// שאלות פתוחות מול החברות בנושא היקף (לאדמין בלבד) — כדי לא לאבד שאלות בתקופת הלימוד מול הטעינות. נשמר ב-adminQuestions — גישה רק דרך /api/admin-questions.

export type AdminQuestionStatus = 'open' | 'answered' | 'closed';

export interface AdminQuestion {
  id: string;
  companyId: string;
  company: string;
  /** מיקום בדף, למשל "hekef.clal.shk" — לפיו מוצגת התגית ליד הנושא */
  anchor: string;
  /** נושא / איפה, בטקסט חופשי — לשאלות שנרשמו ממסך הריכוז (לא מתגית בדף) */
  location: string;
  question: string;
  /** דוגמה קונקרטית (מותר: שמות, פוליסות, סכומים) */
  example: string;
  status: AdminQuestionStatus;
  answer: string;
  createdAt: string | null;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string;
}

/** מה הסנכרון מהקוד יעשה: שאלות חדשות, עדכוני נוסח, ושאלות שנערכו במסך (לא יידרסו) */
export interface AdminQuestionsSync {
  newCount: number;
  updateCount: number;
  adoptCount: number;
  editedCount: number;
  edited: { id: string; key: string }[];
}

export const STATUS_LABEL: Record<AdminQuestionStatus, string> = {
  open: 'פתוחה',
  answered: 'נענתה',
  closed: 'נסגרה',
};

/** מיקומים מוכרים — שם להצגה ואיפה בדף */
export const ANCHORS: Record<string, { label: string; href: string }> = {
  'hekef.clal.explainer': { label: 'היקף · כלל · סיכום החודש', href: '/importCommissionHub/CommissionSummary' },
  'hekef.clal.shk': { label: 'היקף · כלל · התחשבנות שנים קודמות', href: '/importCommissionHub/CommissionSummary' },
  'hekef.clal.tiers': { label: 'היקף · כלל · מדרגות בהסכם', href: '/importCommissionHub/CommissionSummary' },
  'hekef.clal.cancel': { label: 'היקף · כלל · ביטולים', href: '/importCommissionHub/CommissionSummary' },
  'hekef.clal.risk': { label: 'היקף · כלל · פיגור', href: '/importCommissionHub/CommissionSummary' },
  'hekef.clal.policies': { label: 'היקף · כלל · פוליסות', href: '/importCommissionHub/CommissionSummary' },
  'hekef.menora.explainer': { label: 'היקף · מנורה · סיכום החודש', href: '/importCommissionHub/CommissionSummary' },
  'hekef.menora.cancel': { label: 'היקף · מנורה · ביטולים', href: '/importCommissionHub/CommissionSummary' },
  'hekef.menora.policies': { label: 'היקף · מנורה · פוליסות', href: '/importCommissionHub/CommissionSummary' },
  'hekef.migdal.explainer': { label: 'היקף · מגדל · סיכום החודש', href: '/importCommissionHub/CommissionSummary' },
  'hekef.migdal.bases': { label: 'היקף · מגדל · בסיסי זיכוי', href: '/importCommissionHub/CommissionSummary' },
  'hekef.migdal.cancel': { label: 'היקף · מגדל · ביטולים', href: '/importCommissionHub/CommissionSummary' },
  'hekef.migdal.risk': { label: 'היקף · מגדל · פיגור', href: '/importCommissionHub/CommissionSummary' },
  'hekef.migdal.policies': { label: 'היקף · מגדל · פוליסות', href: '/importCommissionHub/CommissionSummary' },
  'hekef.menora.corrections': { label: 'היקף · מנורה · תיקוני אחוז', href: '/importCommissionHub/CommissionSummary' },
};
