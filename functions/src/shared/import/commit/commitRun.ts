// functions/src/shared/import/commit/commitRun.ts
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

function buildCommissionSummaryId(s: {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  templateId: string;
  companyId: string;
}) {
  return `${s.agentId}_${s.agentCode}_${s.reportMonth}_${s.templateId}_${s.companyId}`;
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
  return `${s.agentId}_${s.agentCode}_${s.reportMonth}_${s.companyId}_${s.policyNumberKey}_${s.customerId}_${s.templateId}`;
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

function getCommissionGroupKey(row: StandardizedRow): CommissionGroupKey | null {
  const agentId = String(row.agentId ?? "").trim();
  const agentCode = String(row.agentCode ?? "").trim();
  const reportMonth = sanitizeMonth(row.reportMonth);
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

function commissionGroupKeyToString(key: CommissionGroupKey) {
  return `${key.agentId}__${key.agentCode}__${key.reportMonth}__${key.templateId}__${key.companyId}`;
}

async function recomputeForCommissionGroup(params: {
  adapter: FirestoreAdapter;
  key: CommissionGroupKey;
  runId: string;
}): Promise<{
  commissionSummary: CommissionSummary | null;
  policySummaries: PolicyCommissionSummary[];
}> {
  const {adapter, key, runId} = params;

const q = adapter.query(
  adapter.collection("externalCommissions"),
  adapter.where("agentId", "==", key.agentId),
  adapter.where("reportMonth", "==", key.reportMonth),
  adapter.where("templateId", "==", key.templateId),
  adapter.where("companyId", "==", key.companyId)
);

const docs = await adapter.getDocs(q);

const rows = docs
  .map((d) => d.data || {})
  .filter((row: any) => String(row.agentCode ?? "").trim() === key.agentCode) as StandardizedRow[];
  

  if (!rows.length) {
    return {
      commissionSummary: null,
      policySummaries: [],
    };
  }

  // commission summary
  const first = rows[0];
  const commissionSummary: CommissionSummary = {
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

  // policy summaries under this commission group
  const policyMap = new Map<string, PolicyCommissionSummary>();

  for (const row of rows) {
    const commission = Number((row as any).commissionAmount ?? 0);
    const premium = Number((row as any).premium ?? 0);

    commissionSummary.totalCommissionAmount += isNaN(commission) ? 0 : commission;
    commissionSummary.totalPremiumAmount += isNaN(premium) ? 0 : premium;

    const policyNumberKey = normalizePolicyKey((row as any).policyNumberKey ?? (row as any).policyNumber);
    const customerId = toPadded9((row as any).customerId ?? (row as any).customerIdRaw ?? "");
    const validMonth = sanitizeMonth((row as any).validMonth);
    const product = String((row as any).product ?? "").trim();
    const fullName = String((row as any).fullName ?? "").trim();

    if (!policyNumberKey || !customerId) continue;

    const policyKey = buildPolicySummaryId({
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
        company: String((row as any).company ?? ""),
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

  return {
    commissionSummary,
    policySummaries: Array.from(policyMap.values()),
  };
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
  const {
    adapter,
    runDoc,
    rowsPrepared,
    commissionSummaries: _commissionSummaries,
    policySummaries: _policySummaries,
    agentCodes,
  } = params;

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

  // 2) externalCommissions (new docs)
  await writeInChunks(adapter, rowsPrepared, CHUNK, (batch, row) => {
    const ref = adapter.doc(adapter.collection("externalCommissions"));
    batch.set(ref, stripUndefined(row));
  });

  // 3) identify affected commission groups from current rows
  const affectedGroupsMap = new Map<string, CommissionGroupKey>();

  for (const row of rowsPrepared) {
    const key = getCommissionGroupKey(row);
    if (!key) continue;
    affectedGroupsMap.set(commissionGroupKeyToString(key), key);
  }

  // 4) recompute summaries from externalCommissions (source of truth)
  const recomputedCommissionSummaries: CommissionSummary[] = [];
  const recomputedPolicySummaries: PolicyCommissionSummary[] = [];

  for (const key of affectedGroupsMap.values()) {
    const recomputed = await recomputeForCommissionGroup({
      adapter,
      key,
      runId: runDoc.runId,
    });

    if (recomputed.commissionSummary) {
      recomputedCommissionSummaries.push(recomputed.commissionSummary);
    }
    recomputedPolicySummaries.push(...recomputed.policySummaries);
  }

  // 5) write commissionSummaries (deterministic id, recomputed)
  await writeInChunks(adapter, recomputedCommissionSummaries, CHUNK, (batch, s) => {
    const id = buildCommissionSummaryId({
      agentId: s.agentId,
      agentCode: String(s.agentCode ?? "").trim(),
      reportMonth: sanitizeMonth(s.reportMonth),
      templateId: s.templateId,
      companyId: s.companyId,
    });
    const ref = adapter.doc(`commissionSummaries/${id}`);
    batch.set(
      ref,
      stripUndefined({
        ...s,
        reportMonth: sanitizeMonth(s.reportMonth),
        updatedAt: adapter.serverTimestamp(),
      }),
      {merge: true}
    );
  });

  // 6) write policyCommissionSummaries (deterministic id, recomputed)
  await writeInChunks(adapter, recomputedPolicySummaries, CHUNK, (batch, s) => {
    const id = buildPolicySummaryId({
      agentId: s.agentId,
      agentCode: String(s.agentCode ?? "").trim(),
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
        reportMonth: sanitizeMonth(s.reportMonth),
        validMonth: sanitizeMonth(s.validMonth),
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