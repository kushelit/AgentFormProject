// src/utils/contractCommissionCalculator.ts
import type { ContractForCompareCommissions } from '@/types/Contract';
import type { SalesToCompareCommissions } from '@/types/Sales';
import type { CommissionSplit } from '@/types/CommissionSplit';
import { calculateCommissions } from '@/utils/commissionCalculations';

/**
 * שדות פרמיה/צבירה אפשריים (כמו ב-SALES / בתבניות)
 */
export type PremiumField =
  | 'insPremia'
  | 'pensiaPremia'
  | 'pensiaZvira'
  | 'finansimPremia'
  | 'finansimZvira';

/**
 * תוצאה מחושבת להשוואה
 */
export type ExpectedFromContractResult = {
  expectedAmount: number;           // commissionNifraim (אחרי split אם יש)
  contractRate: number;             // commissionNifraim מהחוזה שנמצא
  contractMatchType: 'product' | 'group' | 'none';
  usedContract?: ContractForCompareCommissions | null;
  saleMock: Partial<SalesToCompareCommissions>;
};

/** נרמול boolean של מינוי סוכן */
export const normalizeMinuy = (val: any): boolean => {
  if (typeof val === 'boolean') return val;
  const s = String(val ?? '').trim().toLowerCase();
  if (!s) return false;
  return ['1', 'true', 'כן', 'y', 't', 'on'].includes(s);
};

export const matchMinuy = (cMin?: any, sMin?: any) =>
  normalizeMinuy(cMin) === normalizeMinuy(sMin);

/**
 * בונה saleMock מינימלי בשביל calculateCommissions
 * ממלא רק את שדה הפרמיה שנבחר, כל השאר 0.
 */
export function buildSaleMockFromPremiumField(args: {
  agentId: string;
  company: string;
  canonicalProduct: string;
  premiumFieldUsed: string | undefined;
  premiumAmount: number;
  customerId?: string;
  policyNumber?: string;
  reportMonth?: string;
  minuySochen?: boolean; // אצלך כרגע תמיד false במסך contracts
}): SalesToCompareCommissions {
  const {
    agentId,
    company,
    canonicalProduct,
    premiumFieldUsed,
    premiumAmount,
    customerId,
    policyNumber,
    reportMonth,
    minuySochen,
  } = args;

  const base: any = {
    AgentId: agentId,
    agentId,
    company,
    product: canonicalProduct,
    // שדות "עיגון" כדי שלא יהיו undefined
    insPremia: 0,
    pensiaPremia: 0,
    pensiaZvira: 0,
    finansimPremia: 0,
    finansimZvira: 0,
    minuySochen: !!minuySochen,
    customerId: customerId,
    IDCustomer: customerId,
    policyNumber: policyNumber,
    month: reportMonth,
    mounth: reportMonth,
  };

  const field = (premiumFieldUsed || '') as PremiumField;

  // ממלאים רק אם זה אחד מהשדות המוכרים
  if (
    field === 'insPremia' ||
    field === 'pensiaPremia' ||
    field === 'pensiaZvira' ||
    field === 'finansimPremia' ||
    field === 'finansimZvira'
  ) {
    base[field] = Number(premiumAmount || 0);
  }

  return base as SalesToCompareCommissions;
}

/**
 * מוצא חוזה:
 * 1) התאמה מדויקת לפי company + canonicalProduct (+ minuy)
 * 2) נפילה לקבוצת מוצר לפי productMap[canonicalProduct].productGroup (+ minuy)
 *
 * שימי לב:
 * - הפונקציה הזו *לא* עושה שום IO.
 * - productMap פה הוא מהמוצרים של המערכת (collection product), כמו במסך הקיים.
 */
export function findContractMatch(args: {
  agentId: string;
  company: string;
  canonicalProduct: string | undefined;
  minuySochen: boolean;
  contracts: ContractForCompareCommissions[];
  productMap: Record<string, { productName: string; productGroup: string; isOneTime?: boolean }>;
}): {
  contractMatch: ContractForCompareCommissions | null;
  matchType: 'product' | 'group' | 'none';
} {
  const { agentId, company, canonicalProduct, minuySochen, contracts, productMap } = args;

  if (!canonicalProduct) return { contractMatch: null, matchType: 'none' };

  const canonCompany = String(company || '').trim();
  const productName = String(canonicalProduct || '').trim();

  // 1) התאמה מדויקת
  const direct = contracts.find(c =>
    String((c as any).AgentId ?? (c as any).agentId ?? '').trim() === String(agentId).trim() &&
    String((c as any).company ?? '').trim() === canonCompany &&
    String((c as any).product ?? '').trim() === productName &&
    matchMinuy((c as any).minuySochen, minuySochen)
  );

  if (direct) return { contractMatch: direct, matchType: 'product' };

  // 2) נפילה לקבוצת מוצר
  const pg = productMap[productName]?.productGroup;
  if (!pg) return { contractMatch: null, matchType: 'none' };

  const group = contracts.find(c =>
    String((c as any).productsGroup ?? '').trim() === String(pg).trim() &&
    String((c as any).AgentId ?? (c as any).agentId ?? '').trim() === String(agentId).trim() &&
    matchMinuy((c as any).minuySochen, minuySochen)
  );

  if (group) return { contractMatch: group, matchType: 'group' };

  return { contractMatch: null, matchType: 'none' };
}

/**
 * חישוב עמלת נפרעים צפויה מהסכם + פרמיה מהקובץ.
 * - משתמש ב-calculateCommissions (כמו המסך הקיים)
 * - תומך ב-splitPercent אופציונלי (בדיוק כמו היום)
 */
export function computeExpectedFromContract(args: {
  agentId: string;
  company: string;
  canonicalProduct: string | undefined;

  premiumFieldUsed: string | undefined;
  premiumAmount: number;

  contracts: ContractForCompareCommissions[];
  productMap: Record<string, { productName: string; productGroup: string; isOneTime?: boolean }>;

  // אצלך במסך הזה כרגע: תמיד false
  minuySochen?: boolean;

  // תמיכה בפיצול (אם תרצי להפעיל גם כאן)
  splitPercent?: number;

  // להעשרת saleMock
  customerId?: string;
  policyNumber?: string;
  reportMonth?: string;
}): ExpectedFromContractResult {
  const {
    agentId,
    company,
    canonicalProduct,
    premiumFieldUsed,
    premiumAmount,
    contracts,
    productMap,
    minuySochen,
    splitPercent,
    customerId,
    policyNumber,
    reportMonth,
  } = args;

  const saleMock = buildSaleMockFromPremiumField({
    agentId,
    company,
    canonicalProduct: String(canonicalProduct || '').trim(),
    premiumFieldUsed,
    premiumAmount,
    customerId,
    policyNumber,
    reportMonth,
    minuySochen: !!minuySochen,
  });

  const { contractMatch, matchType } = findContractMatch({
    agentId,
    company,
    canonicalProduct,
    minuySochen: !!minuySochen,
    contracts,
    productMap,
  });

  const contractRate = Number((contractMatch as any)?.commissionNifraim ?? 0);

  if (!contractMatch) {
    return {
      expectedAmount: 0,
      contractRate: 0,
      contractMatchType: 'none',
      usedContract: null,
      saleMock,
    };
  }

  const commissions = calculateCommissions(
    saleMock,
    contractMatch,
    contracts,
    productMap,
    agentId,
    { splitPercent: splitPercent ?? 100 }
  );

  return {
    expectedAmount: Number((commissions as any)?.commissionNifraim ?? 0),
    contractRate,
    contractMatchType: matchType,
    usedContract: contractMatch,
    saleMock,
  };
}
