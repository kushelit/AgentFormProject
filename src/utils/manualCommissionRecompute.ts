import {
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  doc,
  serverTimestamp,
} from "firebase/firestore";

/* ---------- helpers ---------- */

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

function roundTo2(num: number) {
  return Math.round(num * 100) / 100;
}

function sanitizeMonthLocal(v: any): string {
  return String(v ?? "").replace(/\//g, "-").trim();
}

function toPadded9Local(v: any): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(9, "0").slice(-9) : "";
}

function normalizePolicyKeyLocal(v: any): string {
  return String(v ?? "").trim().replace(/\s+/g, "");
}

function buildCommissionSummaryIdLocal(s: {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  templateId: string;
  companyId: string;
}) {
  return `${s.agentId}_${s.agentCode}_${s.reportMonth}_${s.templateId}_${s.companyId}`;
}

function buildPolicySummaryIdLocal(s: {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  companyId: string;
  policyNumberKey: string;
  customerId: string;
  templateId: string;
}) {
  return `${s.agentId}_${s.agentCode}_${s.reportMonth}_${s.companyId}_${s.policyNumberKey}_${s.customerId}_${s.templateId}`;
}

/* ---------- group key ---------- */

type ManualCommissionGroupKey = {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  templateId: string;
  companyId: string;
};

function getManualCommissionGroupKey(row: any): ManualCommissionGroupKey | null {
  const agentId = String(row.agentId ?? "").trim();
  const agentCode = String(row.agentCode ?? "").trim();
  const reportMonth = sanitizeMonthLocal(row.reportMonth);
  const templateId = String(row.templateId ?? "").trim();
  const companyId = String(row.companyId ?? "").trim();

  if (!agentId || !agentCode || !reportMonth || !templateId || !companyId) {
    return null;
  }

  return {
    agentId,
    agentCode,
    reportMonth,
    templateId,
    companyId,
  };
}

function manualCommissionGroupKeyToString(key: ManualCommissionGroupKey) {
  return `${key.agentId}__${key.agentCode}__${key.reportMonth}__${key.templateId}__${key.companyId}`;
}

/* ---------- MAIN FUNCTION ---------- */

export async function recomputeSummariesFromExternalManual(params: {
  db: any;
  rowsPrepared: any[];
  runId: string;
}) {
  const { db, rowsPrepared, runId } = params;

  const affectedGroupsMap = new Map<string, ManualCommissionGroupKey>();

  for (const row of rowsPrepared) {
    const key = getManualCommissionGroupKey(row);
    if (!key) continue;
    affectedGroupsMap.set(manualCommissionGroupKeyToString(key), key);
  }

  const recomputedCommissionSummaries: any[] = [];
  const recomputedPolicySummaries: any[] = [];

  for (const key of affectedGroupsMap.values()) {
    const q = query(
      collection(db, "externalCommissions"),
      where("agentId", "==", key.agentId),
      where("reportMonth", "==", key.reportMonth),
      where("templateId", "==", key.templateId),
      where("companyId", "==", key.companyId)
    );

    const snap = await getDocs(q);

    const rows = snap.docs
      .map((d) => d.data())
      .filter((row: any) => String(row.agentCode ?? "").trim() === key.agentCode);

    if (!rows.length) continue;

    const first = rows[0];

    const commissionSummary: any = {
      agentId: key.agentId,
      agentCode: key.agentCode,
      reportMonth: key.reportMonth,
      templateId: key.templateId,
      companyId: key.companyId,
      company: String(first.company ?? ""),
      totalCommissionAmount: 0,
      totalPremiumAmount: 0,
      runId,
    };

    const policyMap = new Map<string, any>();

    for (const row of rows) {
      const commission = Number(row.commissionAmount ?? 0);
      const premium = Number(row.premium ?? 0);

      commissionSummary.totalCommissionAmount += isNaN(commission) ? 0 : commission;
      commissionSummary.totalPremiumAmount += isNaN(premium) ? 0 : premium;

      const policyNumberKey = normalizePolicyKeyLocal(
        row.policyNumberKey ?? row.policyNumber
      );

      const customerId = toPadded9Local(
        row.customerId ?? row.customerIdRaw ?? ""
      );

      const validMonth = sanitizeMonthLocal(row.validMonth);
      const product = String(row.product ?? "").trim();
      const fullName = String(row.fullName ?? "").trim();

      if (!policyNumberKey || !customerId) continue;

      const policyKey = buildPolicySummaryIdLocal({
        agentId: key.agentId,
        agentCode: key.agentCode,
        reportMonth: key.reportMonth,
        companyId: key.companyId,
        policyNumberKey,
        customerId,
        templateId: key.templateId,
      });

      if (!policyMap.has(policyKey)) {
        policyMap.set(policyKey, {
          agentId: key.agentId,
          agentCode: key.agentCode,
          reportMonth: key.reportMonth,
          validMonth: validMonth || undefined,
          companyId: key.companyId,
          company: String(row.company ?? ""),
          policyNumberKey,
          customerId,
          templateId: key.templateId,
          totalCommissionAmount: 0,
          totalPremiumAmount: 0,
          commissionRate: 0,
          rowsCount: 0,
          product: product || undefined,
          fullName: fullName || undefined,
          runId,
        });
      }

      const s = policyMap.get(policyKey)!;
      s.totalCommissionAmount += isNaN(commission) ? 0 : commission;
      s.totalPremiumAmount += isNaN(premium) ? 0 : premium;
      s.rowsCount += 1;

      if (!s.product && product) s.product = product;
      if (!s.fullName && fullName) s.fullName = fullName;
      if (!s.validMonth && validMonth) s.validMonth = validMonth;
    }

    for (const s of policyMap.values()) {
      const prem = Number(s.totalPremiumAmount ?? 0);
      const comm = Number(s.totalCommissionAmount ?? 0);
      s.commissionRate = prem > 0 ? roundTo2((comm / prem) * 100) : 0;
    }

    recomputedCommissionSummaries.push(commissionSummary);
    recomputedPolicySummaries.push(...Array.from(policyMap.values()));
  }

  /* ---------- write commission summaries ---------- */

  if (recomputedCommissionSummaries.length) {
    for (let i = 0; i < recomputedCommissionSummaries.length; i += 450) {
      const slice = recomputedCommissionSummaries.slice(i, i + 450);
      const batch = writeBatch(db);

      for (const s of slice) {
        const id = buildCommissionSummaryIdLocal({
          agentId: s.agentId,
          agentCode: String(s.agentCode ?? "").trim(),
          reportMonth: sanitizeMonthLocal(s.reportMonth),
          templateId: s.templateId,
          companyId: s.companyId,
        });

      batch.set(
  doc(db, "commissionSummaries", id),
  stripUndefined({
    ...s,
    reportMonth: sanitizeMonthLocal(s.reportMonth),
    updatedAt: serverTimestamp(),
  }),
  { merge: true }
);
      }

      await batch.commit();
    }
  }

  /* ---------- write policy summaries ---------- */

  if (recomputedPolicySummaries.length) {
    for (let i = 0; i < recomputedPolicySummaries.length; i += 450) {
      const slice = recomputedPolicySummaries.slice(i, i + 450);
      const batch = writeBatch(db);

      for (const s of slice) {
        const id = buildPolicySummaryIdLocal({
          agentId: s.agentId,
          agentCode: String(s.agentCode ?? "").trim(),
          reportMonth: sanitizeMonthLocal(s.reportMonth),
          companyId: s.companyId,
          policyNumberKey: normalizePolicyKeyLocal(s.policyNumberKey),
          customerId: toPadded9Local(s.customerId),
          templateId: s.templateId,
        });

       batch.set(
  doc(db, "policyCommissionSummaries", id),
  stripUndefined({
    ...s,
    reportMonth: sanitizeMonthLocal(s.reportMonth),
    validMonth: sanitizeMonthLocal(s.validMonth),
    policyNumberKey: normalizePolicyKeyLocal(s.policyNumberKey),
    customerId: toPadded9Local(s.customerId),
    updatedAt: serverTimestamp(),
  }),
  { merge: true }
);
      }

      await batch.commit();
    }
  }

  return {
    commissionSummariesCount: recomputedCommissionSummaries.length,
    policySummariesCount: recomputedPolicySummaries.length,
  };
}