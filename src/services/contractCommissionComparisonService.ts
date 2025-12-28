// src/services/contractCommissionComparisonService.ts
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import type { TemplateDoc } from '@/types/ContractCommissionComparison';
import type { ContractForCompareCommissions } from '@/types/Contract';

export type PolicyCommissionSummaryDoc = {
  // keys
  agentId: string;
  reportMonth: string; // YYYY-MM
  company: string;
  companyId?: string;
  templateId?: string;

  policyNumberKey: string;
  customerId?: string;
  agentCode?: string;

  // amounts
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  commissionRate?: number;

  // raw product as came from file
  product?: string;
  fullName?: string;
  validMonth?: string;
};

export type LoadContractsComparisonDataArgs = {
  agentId: string;
  reportMonth: string; // YYYY-MM
  company?: string;    // companyName optional filter (same as stored in policyCommissionSummaries.company)
};

export type LoadContractsComparisonDataResult = {
  policyRows: PolicyCommissionSummaryDoc[];
  templatesById: Record<string, TemplateDoc>;
  contracts: ContractForCompareCommissions[];
  systemProductMap: Record<string, { productName: string; productGroup: string; isOneTime?: boolean }>;
};

/**
 * Load everything required for "contracts" comparison mode:
 * - policyCommissionSummaries rows (agentId + reportMonth + optional company)
 * - templates referenced by those rows (by templateId)
 * - contracts for agent
 * - system product map (collection 'product') for calculateCommissions
 */
export async function loadContractsComparisonData(
  args: LoadContractsComparisonDataArgs
): Promise<LoadContractsComparisonDataResult> {
  const { agentId, reportMonth, company } = args;

  // 1) policyCommissionSummaries
  const base: any[] = [
    where('agentId', '==', agentId),
    where('reportMonth', '==', reportMonth),
  ];
  if (company) base.push(where('company', '==', company));

  const polSnap = await getDocs(query(collection(db, 'policyCommissionSummaries'), ...base));
  const policyRows: PolicyCommissionSummaryDoc[] = polSnap.docs.map(d => {
    const raw = d.data() as any;
    return {
      agentId: String(raw.agentId || '').trim(),
      reportMonth: String(raw.reportMonth || '').trim(),
      company: String(raw.company || '').trim(),
      companyId: raw.companyId ? String(raw.companyId).trim() : undefined,
      templateId: raw.templateId ? String(raw.templateId).trim() : undefined,

      policyNumberKey: String(raw.policyNumberKey || raw.policyNumber || '').trim(),
      customerId: raw.customerId ? String(raw.customerId).trim() : undefined,
      agentCode: raw.agentCode ? String(raw.agentCode).trim() : undefined,

      totalCommissionAmount: Number(raw.totalCommissionAmount ?? 0),
      totalPremiumAmount: Number(raw.totalPremiumAmount ?? 0),
      commissionRate: typeof raw.commissionRate !== 'undefined' ? Number(raw.commissionRate) : undefined,

      product: raw.product ? String(raw.product).trim() : undefined,
      fullName: raw.fullName ? String(raw.fullName).trim() : undefined,
      validMonth: raw.validMonth ? String(raw.validMonth).trim() : undefined,
    };
  });

  // 2) templates by id (only those referenced)
  const templateIds = Array.from(
    new Set(policyRows.map(r => r.templateId).filter((x): x is string => Boolean(x)))
  );

  const templatesById: Record<string, TemplateDoc> = {};
  for (const tid of templateIds) {
    const tSnap = await getDoc(doc(db, 'commissionTemplates', tid));
    if (!tSnap.exists()) continue;
    const t = tSnap.data() as any;

    templatesById[tid] = {
      companyId: t.companyId ? String(t.companyId).trim() : undefined,
      companyName: t.companyName ? String(t.companyName).trim() : undefined, // optional if you store it
      defaultPremiumField: t.defaultPremiumField ? String(t.defaultPremiumField).trim() : undefined,
      fallbackProduct: t.fallbackProduct ? String(t.fallbackProduct).trim() : undefined,
      defaultLineOfBusiness: t.defaultLineOfBusiness ? String(t.defaultLineOfBusiness).trim() : undefined,
      productMap: (t.productMap ?? {}) as TemplateDoc['productMap'],
    };
  }

  // 3) contracts for agent
  const cSnap = await getDocs(query(collection(db, 'contracts'), where('AgentId', '==', agentId)));
  const contracts = cSnap.docs.map(d => d.data() as ContractForCompareCommissions);

  // 4) system products map
  const pSnap = await getDocs(collection(db, 'product'));
  const systemProductMap: Record<string, { productName: string; productGroup: string; isOneTime?: boolean }> = {};
  pSnap.forEach(d => {
    const p = d.data() as any;
    const name = String(p?.productName ?? '').trim();
    if (!name) return;
    systemProductMap[name] = {
      productName: name,
      productGroup: String(p?.productGroup ?? '').trim(),
      isOneTime: !!p?.isOneTime,
    };
  });

  return { policyRows, templatesById, contracts, systemProductMap };
}
