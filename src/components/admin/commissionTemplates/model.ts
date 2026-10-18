// src/components/admin/commissionTemplates/model.ts
// עריכת מסמכי commissionTemplates: המרה בין המסמך לטיוטה שבטופס, בדיקות, וחישוב "מה השתנה".
// שומרים רק מפתחות שהמסך מנהל (MANAGED_KEYS) — כל שאר השדות במסמך (productMap, defaultPremiumField...) לא נוגעים בהם.

export type Row = { id: string; a: string; b: string };
export type ValueMapRow = { id: string; field: string; from: string; to: string };

export type TemplateDraft = {
  id: string;
  Name: string;
  companyId: string;
  automationClass: string;
  isactive: boolean;
  commissionIncludesVAT: boolean;
  hekefType: string;
  fields: Row[]; // a = עמודה באקסל (עם "/" רגיל), b = שדה במערכת
  constants: Row[]; // a = שדה, b = ערך
  valueMaps: ValueMapRow[];
  // מתקדם
  fromDownloadOf: string;
  zipInclude: string; // מופרד בפסיקים
  zipExclude: string;
  missingZipEntryBehavior: string;
  sheetName: string;
  missingSheetBehavior: string;
  reportMonthFromHeader: boolean;
  skipZeroCommission: boolean;
  statementParser: string;
  agencyHouseOnly: boolean;
  excludeForAgencyHouse: boolean;
  manualOnly: boolean;
};

/** המפתחות שהמסך כותב. כל מפתח אחר במסמך נשאר כמו שהוא */
export const MANAGED_KEYS = [
  'Name', 'companyId', 'automationClass', 'isactive', 'commissionIncludesVAT', 'hekefType',
  'fields', 'constants', 'valueMaps',
  'fromDownloadOf', 'zipEntryRules', 'missingZipEntryBehavior', 'sheetName', 'missingSheetBehavior',
  'reportMonthFromHeader', 'skipZeroCommission', 'statementParser',
  'agencyHouseOnly', 'excludeForAgencyHouse', 'manualOnly',
] as const;
export type ManagedKey = (typeof MANAGED_KEYS)[number];

export const HEKEF_TYPES: [string, string][] = [
  ['', 'לא היקף (נפרעים / צבירה)'],
  ['hekef_commission', 'עמלות היקף (שומר עמלה)'],
  ['tfuka_letagmul', 'תפוקה לתגמול (פרמיה בלבד)'],
  ['hekefim', 'היקפים (פרמיה בלבד)'],
];

/** שדות מערכת מוכרים — עם תיאור. שדות נוספים שכבר קיימים בתבניות מתווספים לרשימה */
export const KNOWN_SYSTEM_FIELDS: Record<string, string> = {
  agentCode: 'מספר סוכן',
  reportMonth: 'חודש דיווח',
  validMonth: 'חודש תחילה',
  policyNumber: 'מספר פוליסה',
  customerId: 'ת.ז לקוח',
  fullName: 'שם מלא',
  firstName: 'שם פרטי',
  lastName: 'שם משפחה',
  product: 'מוצר',
  commissionAmount: 'סכום עמלה',
  premium: 'פרמיה',
  // היקף
  processingType: 'סוג עיבוד (שוטף/רטרו)',
  productionDate: 'תאריך תפוקה',
  cancellationDate: 'תאריך ביטול',
  movementType: 'סוג תנועה',
  depositType: 'סוג הפקדה',
  grossPremium: 'פרמיה ברוטו',
  cancelledPremium: 'פרמיה שבוטלה',
  agentCancelPercent: 'אחוז ביטול לסוכן',
  agentCancelPremium: 'פרמיה לביטול לסוכן',
  contractCommissionRate: 'אחוז עמלה בהסכם',
  actualCommissionRate: 'אחוז עמלה בפועל',
  premiumChange: 'שינוי בפרמיה',
  prevPremium: 'פרמיה קודמת (חודש קודם / גמ"ח)',
  commissionRate: 'שיעור עמלה',
  cumulativeCommission: 'עמלה / זכאות מצטברת',
  paidSoFar: 'שולם עד כה',
  agentSplitPercent: 'אחוז חלוקת סוכנים',
  registrationDate: 'תאריך רישום תפוקה',
  yearsInForce: 'שנים בתוקף',
  creditBase: 'בסיס זיכוי',
  rewardType: 'סוג תגמול',
  prevStatus: 'סטטוס חודש קודם',
  currentStatus: 'סטטוס נוכחי',
  coverageNumber: 'מספר כיסוי',
  annexType: 'סוג נספח',
  annexYear: 'שנת נספח',
};

let seq = 0;
export const newRowId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

// Firestore לא מקבל "/" בשם שדה במפה — נשמר כ-__SLASH__ (ראו decodeFirestoreFieldKey ב-standardize)
export const encodeExcelKey = (k: string) => k.trim().replace(/\//g, '__SLASH__');
export const decodeExcelKey = (k: string) => String(k).replace(/__SLASH__/g, '/');

const s = (v: unknown) => String(v ?? '').trim();
const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

export const EMPTY_DRAFT: TemplateDraft = {
  id: '', Name: '', companyId: '', automationClass: '', isactive: true, commissionIncludesVAT: false, hekefType: '',
  fields: [], constants: [], valueMaps: [],
  fromDownloadOf: '', zipInclude: '', zipExclude: '', missingZipEntryBehavior: '', sheetName: '', missingSheetBehavior: '',
  reportMonthFromHeader: false, skipZeroCommission: false, statementParser: '',
  agencyHouseOnly: false, excludeForAgencyHouse: false, manualOnly: false,
};

export function draftFromData(id: string, data: any): TemplateDraft {
  const d = data || {};
  return {
    id,
    Name: s(d.Name),
    companyId: s(d.companyId),
    automationClass: s(d.automationClass),
    isactive: d.isactive === true,
    commissionIncludesVAT: d.commissionIncludesVAT === true,
    hekefType: s(d.hekefType),
    fields: Object.entries(d.fields || {}).map(([a, b]) => ({ id: newRowId(), a: decodeExcelKey(a), b: s(b) })),
    constants: Object.entries(d.constants || {}).map(([a, b]) => ({ id: newRowId(), a, b: s(b) })),
    valueMaps: Object.entries(d.valueMaps || {}).flatMap(([field, m]) =>
      Object.entries((m as Record<string, unknown>) || {}).map(([from, to]) => ({ id: newRowId(), field, from, to: s(to) }))
    ),
    fromDownloadOf: s(d.fromDownloadOf),
    zipInclude: (d.zipEntryRules?.include || []).join(', '),
    zipExclude: (d.zipEntryRules?.exclude || []).join(', '),
    missingZipEntryBehavior: s(d.missingZipEntryBehavior),
    sheetName: s(d.sheetName),
    missingSheetBehavior: s(d.missingSheetBehavior),
    reportMonthFromHeader: d.reportMonthFromHeader === true,
    skipZeroCommission: d.skipZeroCommission === true,
    statementParser: s(d.statementParser),
    agencyHouseOnly: d.agencyHouseOnly === true,
    excludeForAgencyHouse: d.excludeForAgencyHouse === true,
    manualOnly: d.manualOnly === true,
  };
}

/**
 * הערך שנשמר לכל מפתח מנוהל. undefined = המפתח לא צריך להיות במסמך
 * (בעריכה: יימחק אם היה קיים; ביצירה: לא ייכתב).
 */
export function payloadFromDraft(d: TemplateDraft): Record<ManagedKey, unknown> {
  const str = (v: string) => (v.trim() ? v.trim() : undefined);
  const flag = (v: boolean) => (v ? true : undefined);
  const fields: Record<string, string> = {};
  d.fields.forEach((r) => {
    if (r.a.trim() && r.b.trim()) fields[encodeExcelKey(r.a)] = r.b.trim();
  });
  const constants: Record<string, string> = {};
  d.constants.forEach((r) => {
    if (r.a.trim()) constants[r.a.trim()] = r.b.trim();
  });
  const valueMaps: Record<string, Record<string, string>> = {};
  d.valueMaps.forEach((r) => {
    if (!r.field.trim() || !r.from.trim()) return;
    (valueMaps[r.field.trim()] ||= {})[r.from.trim()] = r.to.trim();
  });
  const include = list(d.zipInclude);
  const exclude = list(d.zipExclude);
  return {
    Name: str(d.Name),
    companyId: str(d.companyId),
    automationClass: str(d.automationClass),
    isactive: d.isactive,
    commissionIncludesVAT: d.commissionIncludesVAT,
    hekefType: str(d.hekefType),
    fields,
    constants: Object.keys(constants).length ? constants : undefined,
    valueMaps: Object.keys(valueMaps).length ? valueMaps : undefined,
    fromDownloadOf: str(d.fromDownloadOf),
    zipEntryRules: include.length || exclude.length ? { ...(include.length ? { include } : {}), ...(exclude.length ? { exclude } : {}) } : undefined,
    missingZipEntryBehavior: str(d.missingZipEntryBehavior),
    sheetName: str(d.sheetName),
    missingSheetBehavior: str(d.missingSheetBehavior),
    reportMonthFromHeader: flag(d.reportMonthFromHeader),
    skipZeroCommission: flag(d.skipZeroCommission),
    statementParser: str(d.statementParser),
    agencyHouseOnly: flag(d.agencyHouseOnly),
    excludeForAgencyHouse: flag(d.excludeForAgencyHouse),
    manualOnly: flag(d.manualOnly),
  };
}

const stable = (v: unknown): string => {
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as any)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
};

/** המפתחות שהערך שלהם שונה בין שני מצבים */
export function changedKeys(before: TemplateDraft, after: TemplateDraft): ManagedKey[] {
  const a = payloadFromDraft(before);
  const b = payloadFromDraft(after);
  return MANAGED_KEYS.filter((k) => stable(a[k]) !== stable(b[k]));
}

/** טיוטה מתוך JSON מודבק (כמו קובצי התבניות שהוכנו) — id נשאר מהטופס */
export function draftFromJson(text: string, id: string): TemplateDraft {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('ה-JSON צריך להיות אובייקט אחד של תבנית');
  return draftFromData(id || s(obj.id), obj);
}

export type DraftIssues = { errors: string[]; warnings: string[] };

export function validateDraft(d: TemplateDraft, opts: { isNew: boolean; existingIds: Set<string> }): DraftIssues {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (opts.isNew) {
    if (!/^[a-z0-9_]+$/.test(d.id)) errors.push('מזהה התבנית: אותיות אנגליות קטנות, ספרות וקו תחתון בלבד');
    else if (opts.existingIds.has(d.id)) errors.push(`כבר קיימת תבנית בשם ${d.id}`);
  }
  if (!d.Name.trim()) errors.push('חסר שם תבנית');
  if (!d.companyId.trim()) errors.push('לא נבחרה חברה');
  const mapped = d.fields.filter((r) => r.a.trim() && r.b.trim());
  if (!mapped.length) errors.push('אין אף עמודה ממופה');
  if (!mapped.some((r) => r.b.trim() === 'agentCode')) warnings.push('אין עמודה שממופה למספר סוכן (agentCode) — שורות לא יסוננו לפי סוכן');
  if (!mapped.some((r) => r.b.trim() === 'commissionAmount') && !d.hekefType) warnings.push('אין עמודה שממופה לסכום עמלה (commissionAmount)');
  const seen = new Map<string, number>();
  mapped.forEach((r) => seen.set(r.a.trim(), (seen.get(r.a.trim()) || 0) + 1));
  [...seen.entries()].filter(([, n]) => n > 1).forEach(([k]) => errors.push(`העמודה "${k}" ממופה יותר מפעם אחת`));
  if (d.fields.some((r) => r.a.trim() && !r.b.trim())) warnings.push('יש עמודות בלי שדה מערכת — הן לא יישמרו');
  if (d.fromDownloadOf && !opts.existingIds.has(d.fromDownloadOf)) errors.push(`"מאותה הורדה של" מצביע על תבנית שלא קיימת: ${d.fromDownloadOf}`);
  if (d.fromDownloadOf && d.fromDownloadOf === d.id) errors.push('תבנית לא יכולה להיגזר מעצמה');
  if (d.automationClass && d.id && d.automationClass !== d.id) warnings.push(`automationClass (${d.automationClass}) שונה ממזהה התבנית — לרוב הם זהים`);
  return { errors, warnings };
}
