// functions/src/shared/import/types.ts
export type Mapping = Record<string, string>;

export type CommissionTemplate = {
  templateId: string;
  companyId: string;
  companyName: string;
  templateName?: string;
  automationClass?: string;
  commissionIncludesVAT?: boolean;
  fallbackProduct?: string;
  fields: Mapping; // excelCol -> systemField
  missingZipEntryBehavior?: "error" | "skip";
  // hekef_commission = דוח עמלות היקף: שומר את סכום העמלה (בניגוד לשאר סוגי ההיקף שמאפסים אותה)
  // ומנרמל את שדות ההיקף (ראו HEKEF_* ב-standardize)
  hekefType?: "tfuka_letagmul" | "hekefim" | "hekef_commission";
  // המרת ערכים לפי שדה מערכת, למשל { processingType: { RTR: "retro", STF: "current" } }
  valueMaps?: Record<string, Record<string, string>>;

  // ====== אפשרויות קריאה (כלל היקף ואילך) — כולן אופציונליות; בלעדיהן ההתנהגות כמו קודם ======
  // לשונית לפי שם (מכיל). בלי — הלשונית הראשונה
  sheetName?: string;
  // לשונית חסרה: "empty_ok" = אין נתונים החודש, תקין (לא דוח חסר). ברירת מחדל: שגיאה
  missingSheetBehavior?: "error" | "empty_ok";
  // חודש הדיווח מכותרת הקובץ ("חודש ריצה: MM/YYYY") ולא מעמודה
  reportMonthFromHeader?: boolean;
  // ערכים קבועים לכל השורות, למשל { processingType: "retro" }
  constants?: Record<string, string>;
  // לא לשמור שורות שהעמלה בהן 0
  skipZeroCommission?: boolean;
  // חילוץ "דף חשבון" חודשי ברמת סוכן מאותו קובץ
  statementParser?: "clal_hekef";
};

export type BaseRow = {
  agentId: string;
  companyId: string;
  company: string;
  templateId: string;
  sourceFileName: string;
};

export type StandardizedRow = BaseRow & {
  // core fields (may exist depending on mapping)
  agentCode?: string;
  reportMonth?: string; // YYYY-MM
  validMonth?: string; // YYYY-MM
  commissionAmount?: number;
  premium?: number;
  product?: string;

  customerId?: string; // padded 9
  customerIdRaw?: string; // original
  fullName?: string;

  policyNumber?: string;
  policyNumberKey?: string;

  // שדות היקף (hekefType = hekef_commission)
  processingType?: string; // retro / current
  productionDate?: string; // YYYY-MM-DD
  cancellationDate?: string; // YYYY-MM-DD
  movementType?: string;
  depositType?: string;
  grossPremium?: number;
  cancelledPremium?: number;
  agentCancelPercent?: number;
  agentCancelPremium?: number;
  contractCommissionRate?: number;
  actualCommissionRate?: number;
  premiumChange?: number;
  // כלל: פירוט החישוב ברמת פוליסה
  prevPremium?: number; // פרמיה קובעת נטו קודמת: מקדמות — חודש קודם; ש"ק — בגמ"ח (סגירת השנה)
  commissionRate?: number; // שיעור עמלה (ש"ק: שיעור סופי בגמ"ח)
  cumulativeCommission?: number; // זכאות / עמלה מצטברת עד החודש, כולל
  paidSoFar?: number; // שולם עד החודש (לא כולל)
  // מנורה: חלק הסוכן בעמלה, מתי נרשמה התנועה (STF = בחודש העיבוד), ובאיזו שנה של הפוליסה
  agentSplitPercent?: number;
  registrationDate?: string; // YYYY-MM-DD
  yearsInForce?: number;
  // מגדל: לפי איזה הסכם/מבצע זוכתה התנועה, וסוג התגמול (עמלות נפח / מענקים / עמלות פרסים)
  creditBase?: string;
  rewardType?: string;
  // קטגוריית תנועה מנורמלת: new / increase / decrease / cancel / risk / transfer / other
  movementCategory?: string;
  // כלל: סטטוס תפוקה בחודש קודם / נוכחי, כיסוי ונספח
  prevStatus?: string;
  currentStatus?: string;
  coverageNumber?: string;
  annexType?: string;
  annexYear?: string;

  // internal meta
  runId?: string;
};

export type CommissionSummary = {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  templateId: string;
  companyId: string;
  company: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  runId: string;
};

export type PolicyCommissionSummary = {
  agentId: string;
  agentCode: string;
  reportMonth: string; // YYYY-MM
  validMonth?: string; // YYYY-MM
  companyId: string;
  company: string;
  policyNumberKey: string;
  customerId: string;
  templateId: string;

  totalCommissionAmount: number;
  totalPremiumAmount: number;
  commissionRate: number;
  rowsCount: number;

  product?: string;
  fullName?: string;
  runId: string;
};

export type RunDoc = {
  runId: string;
  agentId: string;
  agentName?: string;
  createdBy?: string;
  createdByUserId?: string;

  companyId: string;
  company: string;
  templateId: string;
  templateName?: string;

  reportMonths: string[];
  minReportMonth: string;
  maxReportMonth: string;
  reportMonthsCount: number;

  // backward compat
  reportMonth: string;

  externalCount: number;
  commissionSummariesCount: number;
  policySummariesCount: number;

  createdAt: any;
  updatedAt?: any;

  source?: "manual" | "portalRunner";
  portalRunId?: string;
  ym?: string;
};
