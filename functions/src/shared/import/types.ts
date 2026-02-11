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
};
