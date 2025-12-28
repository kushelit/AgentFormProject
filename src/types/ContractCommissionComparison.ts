// src/types/ContractCommissionComparison.ts

export type ViewMode = 'sales' | 'contracts';

/**
 * תבנית טעינת עמלות (commissionTemplates)
 * משמשת לפענוח מוצר + שדה פרמיה בזמן השוואה
 */
export type TemplateDoc = {
  companyId?: string;
  companyName?: string;

  defaultPremiumField?: string;     // למשל: finansimZvira | insPremia
  fallbackProduct?: string;         // מוצר ברירת מחדל
  defaultLineOfBusiness?: string;

  productMap?: Record<
    string,
    {
      aliases?: string[];
      canonicalProduct?: string;
      premiumField?: string;        // שדה פרמיה ייעודי למוצר
    }
  >;
};

/**
 * שורת השוואה – קובץ מול חוזה
 */
export type ContractComparisonRow = {
  company: string;
  policyNumber: string;
  customerId?: string;

  templateId?: string;
  productRaw?: string;

  canonicalProduct?: string;
  premiumFieldUsed?: string;
  premiumAmount: number;

  // מהקובץ
  reportedCommissionAmount: number;
  reportedRate: number;             // commissionRate מהטעינה

  // מהחוזה
  contractRate: number;             // commissionNifraim
  expectedAmount: number;           // calculateCommissions().commissionNifraim

  // פערים
  amountDiff: number;               // reported - expected
  amountDiffPercent: number;        // abs(diff)/base*100

  rateDiff: number;                 // reportedRate - contractRate
  rateDiffAbs: number;

  // סטטוס לתצוגה
  status: 'ok' | 'diff' | 'no_contract' | 'no_template';

  // מידע דיבאג (admin בלבד)
  debug?: {
    usedFallbackProduct?: boolean;
    contractMatchType?: 'product' | 'group' | 'none';
  };
};
