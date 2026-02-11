// functions/src/shared/import/buildArtifacts.ts
import {sanitizeMonth} from "../month";
import {
  CommissionSummary,
  PolicyCommissionSummary,
  RunDoc,
  StandardizedRow,
} from "./types";

function roundTo2(num: number) {
  return Math.round(num * 100) / 100;
}

function toPadded9(v: any): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(9, "0").slice(-9) : "";
}

function normalizePolicyKey(v: any) {
  return String(v ?? "").trim().replace(/\s+/g, "");
}

export function buildArtifacts(params: {
  standardizedRows: StandardizedRow[];
  runId: string;
  runMeta: Omit<RunDoc, "runId" | "reportMonths" | "minReportMonth" | "maxReportMonth" | "reportMonthsCount" | "reportMonth" | "externalCount" | "commissionSummariesCount" | "policySummariesCount" | "createdAt"> & {
    createdAt: any;
  };
}) {
  const {standardizedRows, runId, runMeta} = params;

  const rowsPrepared: StandardizedRow[] = standardizedRows.map((r) => {
    const customerId = toPadded9(r.customerId ?? r.customerIdRaw ?? "");
    const policyNumberKey = r.policyNumberKey || normalizePolicyKey(r.policyNumber);
    return {
      ...r,
      reportMonth: sanitizeMonth(r.reportMonth),
      validMonth: sanitizeMonth(r.validMonth),
      customerId,
      policyNumberKey,
      runId,
    };
  });

  // commissionSummaries
  const summariesMap = new Map<string, CommissionSummary>();
  for (const row of rowsPrepared) {
    const sanitizedMonth = sanitizeMonth(row.reportMonth);
    const key = `${row.agentId}_${row.agentCode}_${sanitizedMonth}_${row.templateId}_${row.companyId}`;

    if (!row.agentId || !row.agentCode || !sanitizedMonth || !row.templateId || !row.companyId) continue;

    if (!summariesMap.has(key)) {
      summariesMap.set(key, {
        agentId: row.agentId,
        agentCode: String(row.agentCode),
        reportMonth: sanitizedMonth,
        templateId: row.templateId,
        companyId: row.companyId,
        company: row.company || "",
        totalCommissionAmount: 0,
        totalPremiumAmount: 0,
        runId,
      });
    }
    const s = summariesMap.get(key)!;
    const commission = Number(row.commissionAmount ?? 0);
    const premium = Number(row.premium ?? 0);
    s.totalCommissionAmount += isNaN(commission) ? 0 : commission;
    s.totalPremiumAmount += isNaN(premium) ? 0 : premium;
  }

  // policySummaries
  const policyMap = new Map<string, PolicyCommissionSummary>();
  for (const row of rowsPrepared) {
    const reportMonth = sanitizeMonth(row.reportMonth);
    const validMonth = sanitizeMonth(row.validMonth);
    const agentId = row.agentId;
    const agentCode = String(row.agentCode ?? "").trim();
    const companyId = row.companyId;
    const company = row.company || "";
    const templateId = row.templateId || "";

    const policyNumberKey = row.policyNumberKey || normalizePolicyKey(row.policyNumber);
    const customerId = toPadded9(row.customerId ?? row.customerIdRaw ?? "");

    if (!agentId || !agentCode || !reportMonth || !companyId || !policyNumberKey || !customerId || !templateId) {
      continue;
    }

    const key = `${agentId}_${agentCode}_${reportMonth}_${companyId}_${policyNumberKey}_${customerId}_${templateId}`;

    if (!policyMap.has(key)) {
      policyMap.set(key, {
        agentId,
        agentCode,
        reportMonth,
        validMonth,
        companyId,
        company,
        policyNumberKey,
        customerId,
        templateId,
        totalCommissionAmount: 0,
        totalPremiumAmount: 0,
        commissionRate: 0,
        rowsCount: 0,
        product: row.product ? String(row.product).trim() : undefined,
        fullName: row.fullName ? String(row.fullName).trim() : undefined,
        runId,
      });
    }

    const s = policyMap.get(key)!;
    const commission = Number(row.commissionAmount ?? 0);
    const premium = Number(row.premium ?? 0);
    s.totalCommissionAmount += isNaN(commission) ? 0 : commission;
    s.totalPremiumAmount += isNaN(premium) ? 0 : premium;
    s.rowsCount += 1;

    if (!s.product && row.product) s.product = String(row.product).trim();
    if (!s.fullName && row.fullName) s.fullName = String(row.fullName).trim();
  }

  // commissionRate
  for (const s of policyMap.values()) {
    const prem = Number(s.totalPremiumAmount ?? 0);
    const comm = Number(s.totalCommissionAmount ?? 0);
    s.commissionRate = prem > 0 ? roundTo2((comm / prem) * 100) : 0;
  }

  // runDoc months
  const reportMonths = Array.from(
    new Set(rowsPrepared.map((r) => sanitizeMonth(r.reportMonth)).filter(Boolean))
  ).sort();

  const minReportMonth = reportMonths[0] || "";
  const maxReportMonth = reportMonths.length ? reportMonths[reportMonths.length - 1] : "";

  const runDoc: RunDoc = {
    runId,
    ...runMeta,

    reportMonths,
    minReportMonth,
    maxReportMonth,
    reportMonthsCount: reportMonths.length,

    reportMonth: minReportMonth, // תאימות אחורה

    externalCount: rowsPrepared.length,
    commissionSummariesCount: summariesMap.size,
    policySummariesCount: policyMap.size,
  };

  return {
    rowsPrepared,
    commissionSummaries: Array.from(summariesMap.values()),
    policySummaries: Array.from(policyMap.values()),
    runDoc,
  };
}
