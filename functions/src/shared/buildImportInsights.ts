/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminDb, ensureAdminApp } from "./admin";
function s(v: any) {
  return String(v ?? "").trim();
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function roundTo2(num: number) {
  return Math.round(num * 100) / 100;
}

export type ImportInsights = {
  runId: string;
  agentId: string;
  agentName: string;
  companyId: string;
  company: string;
  templateId: string;
  templateName: string;
  reportMonths: string[];
  minReportMonth: string;
  maxReportMonth: string;

  totalPolicies: number;
  totalCustomers: number;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  zeroCommissionPoliciesCount: number;

  zeroCommissionPoliciesTop: Array<{
    policyNumberKey: string;
    customerId: string;
    fullName: string;
    product: string;
    totalPremiumAmount: number;
  }>;
};

export async function buildImportInsights(runId: string): Promise<ImportInsights> {
  ensureAdminApp();
  const db = adminDb();

  const runRef = db.collection("commissionImportRuns").doc(runId);
  const runSnap = await runRef.get();

  if (!runSnap.exists) {
    throw new Error(`commissionImportRun not found: ${runId}`);
  }

  const run = runSnap.data() || {};

  const agentId = s(run.agentId);
  const companyId = s(run.companyId);
  const templateId = s(run.templateId);

  if (!agentId || !companyId || !templateId) {
    throw new Error(`run ${runId} missing required fields agentId/companyId/templateId`);
  }

  const reportMonths: string[] = Array.isArray(run.reportMonths)
    ? run.reportMonths.map((x: any) => s(x)).filter(Boolean)
    : [];

  const policyRows: any[] = [];

  for (const reportMonth of reportMonths) {
    const q = db
      .collection("policyCommissionSummaries")
      .where("agentId", "==", agentId)
      .where("companyId", "==", companyId)
      .where("templateId", "==", templateId)
      .where("reportMonth", "==", reportMonth);

    const snap = await q.get();
    for (const d of snap.docs) {
      policyRows.push(d.data());
    }
  }

  const uniqueCustomers = new Set<string>();
  let totalCommissionAmount = 0;
  let totalPremiumAmount = 0;

  const zeroCommissionPolicies: Array<{
    policyNumberKey: string;
    customerId: string;
    fullName: string;
    product: string;
    totalPremiumAmount: number;
  }> = [];

  for (const row of policyRows) {
    const customerId = s(row.customerId);
    if (customerId) uniqueCustomers.add(customerId);

    const totalCommission = n(row.totalCommissionAmount);
    const totalPremium = n(row.totalPremiumAmount);

    totalCommissionAmount += totalCommission;
    totalPremiumAmount += totalPremium;

    if (totalCommission === 0) {
      zeroCommissionPolicies.push({
        policyNumberKey: s(row.policyNumberKey),
        customerId,
        fullName: s(row.fullName),
        product: s(row.product),
        totalPremiumAmount: totalPremium,
      });
    }
  }

  zeroCommissionPolicies.sort((a, b) => b.totalPremiumAmount - a.totalPremiumAmount);

  return {
    runId,
    agentId,
    agentName: s(run.agentName),
    companyId,
    company: s(run.company),
    templateId,
    templateName: s(run.templateName),
    reportMonths,
    minReportMonth: s(run.minReportMonth),
    maxReportMonth: s(run.maxReportMonth),

    totalPolicies: policyRows.length,
    totalCustomers: uniqueCustomers.size,
    totalCommissionAmount: roundTo2(totalCommissionAmount),
    totalPremiumAmount: roundTo2(totalPremiumAmount),
    zeroCommissionPoliciesCount: zeroCommissionPolicies.length,

    zeroCommissionPoliciesTop: zeroCommissionPolicies.slice(0, 10),
  };
}