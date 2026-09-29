// src/lib/anomalyRules.ts
// כללי רעש לפוליסות חריגות — מצבים שנראים חריגים אבל הם תקינים, ולכן לא מוצגים לסוכן כברירת מחדל.
// כלל חדש = עוד איבר במערך. השורות שסוננו עדיין זמינות בלחיצה ("הצג אותן"), מסומנות בשם הכלל.
// סדר הכללים חשוב: הכלל הראשון שמתאים הוא זה שמוצג (הספציפי לפני הכללי).

import { PREMIUM_FIELD_LABEL, ZERO_COMMISSION_EXPECTED_FIELDS } from '@/lib/premiumFields';

// ─── דוחות אחים ──────────────────────────────────────────────────────────
// חברה ששולחת את אותה פוליסה בשני דוחות, והעמלה על רכיב מסוים משולמת רק באחד מהם.
// השרת (by-ym, action 'anomalies') מחפש כל חריגה עם עמלה 0 מדוח המקור גם בדוח האח, באותו
// חודש פרסום, ומסמן siblingFound אם הפוליסה קיימת שם (siblingCommission = העמלה שם, לתצוגה).
// למשל הראל "פרט": לפעמים רכיב חיסכון (העמלה בדוח הצבירה) ולפעמים כיסוי ביטוח חיים אמיתי —
// קיום פוליסה אחות בצבירה הוא מה שמבדיל ביניהם.
export type SiblingReport = {
  /** templateId של הדוח שבו מופיעה החריגה */
  template: string;
  /** templateId של הדוח שבו משולמת העמלה */
  sibling: string;
  /** אופציונלי: רק מוצרים גולמיים אלה (כפי שמגיעים בקובץ) */
  rawProducts?: string[];
  /** הסבר קצר לסוכן */
  reason: string;
  /**
   * סיווג השורה כשנמצאה לה פוליסה אחות — משמש גם את הסקירה (קוביות, מוצרים, יעילות):
   * למשל הראל "פרט" עם אחות בצבירה = רכיב חיסכון (הפקדה), לא פרמיית ביטוח חיים.
   */
  reclassifyAs?: { canonicalProduct: string; premiumField: string };
};

export const SIBLING_REPORTS: SiblingReport[] = [
  {
    template: 'harel_insurance',
    sibling: 'harel_tzvira',
    rawProducts: ['פרט'],
    reason: 'רכיב חיסכון של הפוליסה — העמלה משולמת בדוח הצבירה של הראל',
    reclassifyAs: { canonicalProduct: 'פוליסת חיסכון', premiumField: 'finansimPremia' },
  },
];

export const normRawProduct = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function siblingReportFor(templateId: string, rawProduct?: string): SiblingReport | null {
  const p = normRawProduct(rawProduct);
  return (
    SIBLING_REPORTS.find(
      (s) => s.template === templateId && (!s.rawProducts?.length || s.rawProducts.some((x) => normRawProduct(x) === p))
    ) ?? null
  );
}

// ─── הכללים ──────────────────────────────────────────────────────────────
export type AnomalyCandidate = {
  commission: number;
  premium: number;
  /** שדה הפרמיה/צבירה לפי המיפוי של המוצר בתבנית */
  premiumField: string;
  product: string;
  rawProduct: string;
  templateId: string;
  /** האם הפוליסה קיימת בדוח האח (אם הוגדר) */
  siblingFound?: boolean;
  /** העמלה של הפוליסה בדוח האח — לתצוגה בלבד */
  siblingCommission?: number;
  siblingTemplate?: string;
};

export type NoiseRule = {
  id: string;
  /** שם קצר — לתג בטבלה ולסיכום */
  label: string;
  /** הסבר כללי — למה זה לא חריגה */
  description: string;
  /** הסבר לשורה ספציפית (אופציונלי) — מוצג כשמעבירים עכבר על התג */
  explain?: (r: AnomalyCandidate) => string;
  test: (r: AnomalyCandidate) => boolean;
};

export const NOISE_RULES: NoiseRule[] = [
  {
    id: 'sibling-report-commission',
    label: 'פוליסה אחות בדוח אחר',
    description:
      'עמלה 0 בדוח אחד, כשאותה פוליסה קיימת גם בדוח האח של אותה חברה באותו חודש פרסום (למשל הראל "פרט" שהוא רכיב חיסכון — העמלה משולמת בדוח הצבירה). ללא קשר לפרמיה. עמלה שלילית עדיין מוצגת כחריגה.',
    explain: (r) => {
      const s = siblingReportFor(r.templateId, r.rawProduct);
      const amount = Number(r.siblingCommission ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
      return `${s?.reason ?? 'העמלה משולמת בדוח אחר'} — ${r.siblingTemplate ?? ''}: עמלה ${amount} ₪`;
    },
    // עמלה 0 + קיום פוליסה אחות. בלי תנאי על הפרמיה (הכלל "אין פעילות" הוא כלל נפרד, לכל הדוחות),
    // ובלי תנאי על העמלה אצל האח — אם גם שם 0, השורה ההיא תופיע כחריגה בדוח הצבירה עצמו.
    test: (r) => r.commission === 0 && !!r.siblingFound,
  },
  {
    id: 'zero-commission-expected-field',
    label: 'עמלה 0 צפויה',
    description: `עמלה 0 בדיוק בשדה שבו אין עמלה צפויה (${Array.from(ZERO_COMMISSION_EXPECTED_FIELDS)
      .map((f) => PREMIUM_FIELD_LABEL[f] || f)
      .join(', ')}). עמלה שלילית באותו שדה עדיין מוצגת כחריגה.`,
    test: (r) => r.commission === 0 && ZERO_COMMISSION_EXPECTED_FIELDS.has(r.premiumField),
  },
  {
    id: 'no-activity',
    label: 'אין פעילות',
    description: 'עמלה 0 ופרמיה/צבירה 0 — אין תנועה בפוליסה, ולכן אין חריגה.',
    test: (r) => r.commission === 0 && r.premium === 0,
  },
];

/** הכלל הראשון שמתאים לשורה, או null אם זו חריגה אמיתית */
export function matchNoiseRule(r: AnomalyCandidate): NoiseRule | null {
  return NOISE_RULES.find((rule) => rule.test(r)) ?? null;
}