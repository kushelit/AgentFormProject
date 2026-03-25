import {FirestoreAdapter} from "./adapters";
import {CommissionSummary, PolicyCommissionSummary, RunDoc, StandardizedRow} from "../types";

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function roundTo2(num: number) {
  return Math.round(num * 100) / 100;
}

function sanitizeMonth(v: any): string {
  return String(v ?? "").replace(/\//g, "-").trim();
}

function toPadded9(v: any): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(9, "0").slice(-9) : "";
}

function normalizePolicyKey(v: any): string {
  return String(v ?? "").trim().replace(/\s+/g, "");
}

function normalizeAgentCode(v: any): string {
  return String(v ?? "").trim();
}

function buildCommissionSummaryId(s: {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  templateId: string;
  companyId: string;
}) {
  return `${s.agentId}_${normalizeAgentCode(s.agentCode)}_${sanitizeMonth(s.reportMonth)}_${s.templateId}_${s.companyId}`;
}

function buildPolicySummaryId(s: {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  companyId: string;
  policyNumberKey: string;
  customerId: string;
  templateId: string;
}) {
  return `${s.agentId}_${normalizeAgentCode(s.agentCode)}_${sanitizeMonth(s.reportMonth)}_${s.companyId}_${normalizePolicyKey(s.policyNumberKey)}_${toPadded9(s.customerId)}_${s.templateId}`;
}

async function writeInChunks<T>(
  adapter: FirestoreAdapter,
  items: T[],
  chunkSize: number,
  writer: (batch: any, item: T) => void
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const slice = items.slice(i, i + chunkSize);
    const batch = adapter.writeBatch();
    for (const item of slice) writer(batch, item);
    await batch.commit();
  }
}

type CommissionGroupKey = {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  templateId: string;
  companyId: string;
};

function commissionGroupKeyToString(key: CommissionGroupKey) {
  return `${key.agentId}__${key.agentCode}__${key.reportMonth}__${key.templateId}__${key.companyId}`;
}

function getCommissionGroupKeyFromSummary(s: CommissionSummary): CommissionGroupKey {
  return {
    agentId: String(s.agentId ?? "").trim(),
    agentCode: normalizeAgentCode(s.agentCode),
    reportMonth: sanitizeMonth(s.reportMonth),
    templateId: String(s.templateId ?? "").trim(),
    companyId: String(s.companyId ?? "").trim(),
  };
}

function getPolicyGroupKeyFromPolicySummary(s: PolicyCommissionSummary): string {
  return commissionGroupKeyToString({
    agentId: String(s.agentId ?? "").trim(),
    agentCode: normalizeAgentCode(s.agentCode),
    reportMonth: sanitizeMonth(s.reportMonth),
    templateId: String(s.templateId ?? "").trim(),
    companyId: String(s.companyId ?? "").trim(),
  });
}

function normalizePolicySummary(s: PolicyCommissionSummary, runId: string): PolicyCommissionSummary {
  const normalized: PolicyCommissionSummary = {
    ...s,
    agentId: String(s.agentId ?? "").trim(),
    agentCode: normalizeAgentCode(s.agentCode),
    reportMonth: sanitizeMonth(s.reportMonth),
    validMonth: s.validMonth ? sanitizeMonth(s.validMonth) : undefined,
    companyId: String(s.companyId ?? "").trim(),
    company: String(s.company ?? "").trim(),
    policyNumberKey: normalizePolicyKey(s.policyNumberKey),
    customerId: toPadded9(s.customerId),
    templateId: String(s.templateId ?? "").trim(),
    totalCommissionAmount: Number(s.totalCommissionAmount ?? 0) || 0,
    totalPremiumAmount: Number(s.totalPremiumAmount ?? 0) || 0,
    commissionRate: Number(s.commissionRate ?? 0) || 0,
    rowsCount: Number(s.rowsCount ?? 0) || 0,
    product: s.product ? String(s.product).trim() : undefined,
    fullName: s.fullName ? String(s.fullName).trim() : undefined,
    runId,
  };

  return normalized;
}

function mergePolicySummaries(params: {
  existing: PolicyCommissionSummary[];
  incoming: PolicyCommissionSummary[];
  runId: string;
}): PolicyCommissionSummary[] {
  const {existing, incoming, runId} = params;

  const map = new Map<string, PolicyCommissionSummary>();

  for (const raw of existing) {
    const s = normalizePolicySummary(raw, runId);
    const id = buildPolicySummaryId({
      agentId: s.agentId,
      agentCode: s.agentCode,
      reportMonth: s.reportMonth,
      companyId: s.companyId,
      policyNumberKey: s.policyNumberKey,
      customerId: s.customerId,
      templateId: s.templateId,
    });
    map.set(id, s);
  }

  for (const raw of incoming) {
    const s = normalizePolicySummary(raw, runId);
    const id = buildPolicySummaryId({
      agentId: s.agentId,
      agentCode: s.agentCode,
      reportMonth: s.reportMonth,
      companyId: s.companyId,
      policyNumberKey: s.policyNumberKey,
      customerId: s.customerId,
      templateId: s.templateId,
    });

    const prev = map.get(id);
    if (!prev) {
      map.set(id, s);
      continue;
    }

    const merged: PolicyCommissionSummary = {
      ...prev,
      totalCommissionAmount: (Number(prev.totalCommissionAmount ?? 0) || 0) + (Number(s.totalCommissionAmount ?? 0) || 0),
      totalPremiumAmount: (Number(prev.totalPremiumAmount ?? 0) || 0) + (Number(s.totalPremiumAmount ?? 0) || 0),
      rowsCount: (Number(prev.rowsCount ?? 0) || 0) + (Number(s.rowsCount ?? 0) || 0),
      runId,
    };

    if (!merged.product && s.product) merged.product = s.product;
    if (!merged.fullName && s.fullName) merged.fullName = s.fullName;
    if (!merged.validMonth && s.validMonth) merged.validMonth = s.validMonth;
    if (!merged.company && s.company) merged.company = s.company;

    const prem = Number(merged.totalPremiumAmount ?? 0) || 0;
    const comm = Number(merged.totalCommissionAmount ?? 0) || 0;
    merged.commissionRate = prem > 0 ? roundTo2((comm / prem) * 100) : 0;

    map.set(id, merged);
  }

  return Array.from(map.values());
}

function buildCommissionSummaryFromPolicies(params: {
  key: CommissionGroupKey;
  policies: PolicyCommissionSummary[];
  runId: string;
  fallbackCompany?: string;
}): CommissionSummary {
  const {key, policies, runId, fallbackCompany} = params;

  let totalCommissionAmount = 0;
  let totalPremiumAmount = 0;
  let company = fallbackCompany || "";

  for (const p of policies) {
    totalCommissionAmount += Number(p.totalCommissionAmount ?? 0) || 0;
    totalPremiumAmount += Number(p.totalPremiumAmount ?? 0) || 0;
    if (!company && p.company) company = String(p.company);
  }

  return {
    agentId: key.agentId,
    agentCode: key.agentCode,
    reportMonth: key.reportMonth,
    templateId: key.templateId,
    companyId: key.companyId,
    company,
    totalCommissionAmount,
    totalPremiumAmount,
    runId,
  };
}

async function loadExistingPolicySummariesForGroup(
  adapter: FirestoreAdapter,
  key: CommissionGroupKey
): Promise<PolicyCommissionSummary[]> {
  const q = adapter.query(
    adapter.collection("policyCommissionSummaries"),
    adapter.where("agentId", "==", key.agentId),
    adapter.where("reportMonth", "==", key.reportMonth),
    adapter.where("templateId", "==", key.templateId),
    adapter.where("companyId", "==", key.companyId)
  );

  const docs = await adapter.getDocs(q);

  return docs
    .map((d) => d.data || {})
    .filter((row: any) => normalizeAgentCode(row.agentCode) === key.agentCode) as PolicyCommissionSummary[];
}

export async function commitRun(params: {
  adapter: FirestoreAdapter;

  runDoc: RunDoc;
  rowsPrepared: StandardizedRow[];
  commissionSummaries: CommissionSummary[];
  policySummaries: PolicyCommissionSummary[];

  // update users.agentCodes
  agentCodes: string[];
}) {
  const {adapter, runDoc, rowsPrepared, commissionSummaries, policySummaries, agentCodes} = params;

  const CHUNK = 450;

  // 1) update users/{agentId}.agentCodes
  if (agentCodes.length) {
    const userRef = adapter.doc(`users/${runDoc.agentId}`);
    const userSnap = await adapter.getDoc(userRef);
    if (userSnap.exists) {
      const existing = Array.isArray(userSnap.data?.agentCodes) ? userSnap.data.agentCodes : [];
      const toAdd = agentCodes.filter((c) => c && !existing.includes(c));
      if (toAdd.length) {
        await adapter.updateDoc(userRef, {agentCodes: adapter.arrayUnion(...toAdd)});
      }
    }
  }

  // 2) externalCommissions (ledger)
  await writeInChunks(adapter, rowsPrepared, CHUNK, (batch, row) => {
    const ref = adapter.doc(adapter.collection("externalCommissions"));
    batch.set(ref, stripUndefined(row));
  });

  // 3) build incoming group maps from current file
  const incomingCommissionByGroup = new Map<string, CommissionSummary>();
  for (const s of commissionSummaries) {
    const key = getCommissionGroupKeyFromSummary(s);
    incomingCommissionByGroup.set(commissionGroupKeyToString(key), {
      ...s,
      agentCode: normalizeAgentCode(s.agentCode),
      reportMonth: sanitizeMonth(s.reportMonth),
      runId: runDoc.runId,
    });
  }

  const incomingPoliciesByGroup = new Map<string, PolicyCommissionSummary[]>();
  for (const s of policySummaries) {
    const groupKey = getPolicyGroupKeyFromPolicySummary(s);
    if (!incomingPoliciesByGroup.has(groupKey)) incomingPoliciesByGroup.set(groupKey, []);
    incomingPoliciesByGroup.get(groupKey)!.push(normalizePolicySummary(s, runDoc.runId));
  }

  const finalCommissionSummaries: CommissionSummary[] = [];
  const finalPolicySummaries: PolicyCommissionSummary[] = [];

  // 4) fast path or merge path per group
  for (const [groupKeyStr, incomingCommission] of incomingCommissionByGroup.entries()) {
    const key = getCommissionGroupKeyFromSummary(incomingCommission);
    const commissionId = buildCommissionSummaryId({
      agentId: key.agentId,
      agentCode: key.agentCode,
      reportMonth: key.reportMonth,
      templateId: key.templateId,
      companyId: key.companyId,
    });

    const existingCommissionRef = adapter.doc(`commissionSummaries/${commissionId}`);
    const existingCommissionSnap = await adapter.getDoc(existingCommissionRef);

    const incomingPolicies = incomingPoliciesByGroup.get(groupKeyStr) || [];

    if (!existingCommissionSnap.exists) {
      // FAST PATH: no prior summary exists for this group
      finalCommissionSummaries.push({
        ...incomingCommission,
        agentCode: key.agentCode,
        reportMonth: key.reportMonth,
        runId: runDoc.runId,
      });
      finalPolicySummaries.push(...incomingPolicies);
      continue;
    }

    // MERGE PATH: summary exists, merge only policy summaries of that group
    const existingPolicies = await loadExistingPolicySummariesForGroup(adapter, key);

    const mergedPolicies = mergePolicySummaries({
      existing: existingPolicies,
      incoming: incomingPolicies,
      runId: runDoc.runId,
    });

    const mergedCommission = buildCommissionSummaryFromPolicies({
      key,
      policies: mergedPolicies,
      runId: runDoc.runId,
      fallbackCompany: String(incomingCommission.company ?? ""),
    });

    finalCommissionSummaries.push(mergedCommission);
    finalPolicySummaries.push(...mergedPolicies);
  }

  // 5) write commissionSummaries
  await writeInChunks(adapter, finalCommissionSummaries, CHUNK, (batch, s) => {
    const id = buildCommissionSummaryId({
      agentId: s.agentId,
      agentCode: normalizeAgentCode(s.agentCode),
      reportMonth: sanitizeMonth(s.reportMonth),
      templateId: s.templateId,
      companyId: s.companyId,
    });
    const ref = adapter.doc(`commissionSummaries/${id}`);
    batch.set(
      ref,
      stripUndefined({
        ...s,
        agentCode: normalizeAgentCode(s.agentCode),
        reportMonth: sanitizeMonth(s.reportMonth),
        updatedAt: adapter.serverTimestamp(),
      }),
      {merge: true}
    );
  });

  // 6) write policyCommissionSummaries
  await writeInChunks(adapter, finalPolicySummaries, CHUNK, (batch, s) => {
    const id = buildPolicySummaryId({
      agentId: s.agentId,
      agentCode: normalizeAgentCode(s.agentCode),
      reportMonth: sanitizeMonth(s.reportMonth),
      companyId: s.companyId,
      policyNumberKey: normalizePolicyKey(s.policyNumberKey),
      customerId: toPadded9(s.customerId),
      templateId: s.templateId,
    });
    const ref = adapter.doc(`policyCommissionSummaries/${id}`);
    batch.set(
      ref,
      stripUndefined({
        ...s,
        agentCode: normalizeAgentCode(s.agentCode),
        reportMonth: sanitizeMonth(s.reportMonth),
        validMonth: s.validMonth ? sanitizeMonth(s.validMonth) : undefined,
        policyNumberKey: normalizePolicyKey(s.policyNumberKey),
        customerId: toPadded9(s.customerId),
        updatedAt: adapter.serverTimestamp(),
      }),
      {merge: true}
    );
  });

  // 7) commissionImportRuns/{runId}
  const runRef = adapter.doc(`commissionImportRuns/${runDoc.runId}`);
  await adapter.setDoc(
    runRef,
    stripUndefined({
      ...runDoc,
      updatedAt: adapter.serverTimestamp(),
    }),
    {merge: true}
  );
}