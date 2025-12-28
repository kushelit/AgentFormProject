// src/utils/buildContractComparisonRow.ts
import type { ContractComparisonRow, TemplateDoc } from '@/types/ContractCommissionComparison';
import type { ContractForCompareCommissions } from '@/types/Contract';
import type { PolicyCommissionSummaryDoc } from '@/services/contractCommissionComparisonService';
import { resolveFromTemplate } from '@/utils/contractCommissionResolvers';
import { computeExpectedFromContract } from '@/utils/contractCommissionCalculator';

const round2 = (n: number) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

export function buildContractComparisonRow(args: {
  agentId: string;
  reportMonth: string;
  row: PolicyCommissionSummaryDoc;

  template: TemplateDoc | null | undefined;
  contracts: ContractForCompareCommissions[];
  systemProductMap: Record<string, { productName: string; productGroup: string; isOneTime?: boolean }>;

  toleranceAmount: number;
  tolerancePercent: number;

  // אם תרצי להפעיל גם כאן split (כרגע אפשר להשאיר undefined)
  splitPercent?: number;

  // כרגע במסך contracts: תמיד false
  minuySochen?: boolean;
}): ContractComparisonRow {
  const {
    agentId,
    reportMonth,
    row,
    template,
    contracts,
    systemProductMap,
    toleranceAmount,
    tolerancePercent,
    splitPercent,
    minuySochen,
  } = args;

  const company = String(row.company || '').trim();
  const policyNumber = String(row.policyNumberKey || '').trim() || '-';
  const customerId = row.customerId ? String(row.customerId).trim() : undefined;

  const reportedCommissionAmount = Number(row.totalCommissionAmount ?? 0);
  const premiumAmount = Number(row.totalPremiumAmount ?? 0);

  const hasRate = row.commissionRate !== null && row.commissionRate !== undefined && isFinite(Number(row.commissionRate));
  const reportedRate = hasRate ? Number(row.commissionRate) : (premiumAmount > 0 ? (reportedCommissionAmount / premiumAmount) * 100 : 0);
  
  // template missing
  if (!template) {
    return {
      company,
      policyNumber,
      customerId,
      templateId: row.templateId,
      productRaw: row.product,
      premiumAmount,
      reportedCommissionAmount,
      reportedRate: round2(reportedRate),

      canonicalProduct: undefined,
      premiumFieldUsed: undefined,

      contractRate: 0,
      expectedAmount: 0,

      amountDiff: round2(reportedCommissionAmount - 0),
      amountDiffPercent: premiumAmount > 0 ? round2((Math.abs(reportedCommissionAmount) / (reportedCommissionAmount || 1)) * 100) : 0,

      rateDiff: round2(reportedRate - 0),
      rateDiffAbs: round2(Math.abs(reportedRate - 0)),

      status: 'no_template',
      debug: {
        usedFallbackProduct: false,
        contractMatchType: 'none',
      },
    };
  }

  // resolve product + premiumFieldUsed on-the-fly from template
  const resolved = resolveFromTemplate(template, row.product);

  const canonicalProduct = resolved.canonicalProduct;
  const premiumFieldUsed = resolved.premiumFieldUsed;

  // compute expected amount via calculateCommissions using saleMock + found contract
  const expected = computeExpectedFromContract({
    agentId,
    company,
    canonicalProduct,

    premiumFieldUsed,
    premiumAmount,

    contracts,
    productMap: systemProductMap,

    minuySochen: !!minuySochen,
    splitPercent: splitPercent ?? 100,

    customerId,
    policyNumber,
    reportMonth,
  });

  const expectedAmount = Number(expected.expectedAmount ?? 0);
  const contractRate = Number(expected.contractRate ?? 0);

  const amountDiff = reportedCommissionAmount - expectedAmount; // reported - expected
  const base = reportedCommissionAmount === 0 ? 1 : Math.abs(reportedCommissionAmount);
  const amountDiffPercent = (Math.abs(amountDiff) / base) * 100;

  const rateDiff = reportedRate - contractRate;
  const rateDiffAbs = Math.abs(rateDiff);

  const hasContract = expected.contractMatchType !== 'none';

  // status decision (כמו היום: סכום או אחוז)
  const withinAmount = Math.abs(amountDiff) <= Number(toleranceAmount || 0);
  const withinPercent = amountDiffPercent <= Number(tolerancePercent || 0);
  const status: ContractComparisonRow['status'] =
    !hasContract
      ? 'no_contract'
      : (withinAmount || withinPercent)
        ? 'ok'
        : 'diff';

  return {
    company,
    policyNumber,
    customerId,

    templateId: row.templateId,
    productRaw: row.product,

    canonicalProduct,
    premiumFieldUsed,
    premiumAmount,

    reportedCommissionAmount: round2(reportedCommissionAmount),
    reportedRate: round2(reportedRate),

    contractRate: round2(contractRate),
    expectedAmount: round2(expectedAmount),

    amountDiff: round2(amountDiff),
    amountDiffPercent: round2(amountDiffPercent),

    rateDiff: round2(rateDiff),
    rateDiffAbs: round2(rateDiffAbs),

    status,
    debug: {
      usedFallbackProduct: !!resolved.debug.usedFallbackProduct,
      contractMatchType: expected.contractMatchType,
    },
  };
}
