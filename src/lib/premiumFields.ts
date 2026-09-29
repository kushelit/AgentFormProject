// src/lib/premiumFields.ts
// שדות הפרמיה / הצבירה שתבנית יכולה לשייך למוצר (premiumField / defaultPremiumField).
// רשימה אחת לכל המערכת — דף מפת המוצרים, פוליסות חריגות וכו'.
// (תואם לחישוב במכירות: פרמיה = ins + pensia + finansim · צבירה = pensiaZvira + finansimZvira)

// zeroCommissionExpected — עמלה 0 בשדה הזה היא מצב תקין (לא חריגה). ראו lib/anomalyRules.
export const PREMIUM_FIELDS = [
  { field: 'insPremia', label: 'פרמיה ביטוח', kind: 'premium', zeroCommissionExpected: false },
  { field: 'pensiaPremia', label: 'פרמיה פנסיה', kind: 'premium', zeroCommissionExpected: false },
  { field: 'pensiaZvira', label: 'צבירה פנסיה', kind: 'zvira', zeroCommissionExpected: false },
  { field: 'finansimPremia', label: 'פרמיה פיננסים', kind: 'premium', zeroCommissionExpected: true },
  { field: 'finansimZvira', label: 'צבירה פיננסית', kind: 'zvira', zeroCommissionExpected: false },
] as const;

/** שדות שבהם עמלה 0 צפויה */
export const ZERO_COMMISSION_EXPECTED_FIELDS = new Set<string>(
  PREMIUM_FIELDS.filter((f) => f.zeroCommissionExpected).map((f) => f.field)
);

export type PremiumFieldName = (typeof PREMIUM_FIELDS)[number]['field'];

export const PREMIUM_FIELD_LABEL: Record<string, string> = Object.fromEntries(PREMIUM_FIELDS.map((f) => [f.field, f.label]));

/** "פרמיה ביטוח (insPremia)" — שדה לא מוכר מוצג כמו שהוא */
export const premiumFieldDisplay = (f: string) => (PREMIUM_FIELD_LABEL[f] ? `${PREMIUM_FIELD_LABEL[f]} (${f})` : f);

/** תווית קצרה בלבד, או '' לשדה ריק */
export const premiumFieldShort = (f?: string) => (f ? PREMIUM_FIELD_LABEL[f] || f : '');