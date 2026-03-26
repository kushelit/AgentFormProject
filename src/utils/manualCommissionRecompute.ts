import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch,
  doc,
  serverTimestamp,
} from "firebase/firestore";

/* ---------- helpers ---------- */

function stripUndefined(obj: any) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
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

/* ---------- ids ---------- */

function buildCommissionSummaryId(s: any) {
  return `${s.agentId}_${normalizeAgentCode(s.agentCode)}_${sanitizeMonth(
    s.reportMonth
  )}_${s.templateId}_${s.companyId}`;
}

function buildPolicySummaryId(s: any) {
  return `${s.agentId}_${normalizeAgentCode(s.agentCode)}_${sanitizeMonth(
    s.reportMonth
  )}_${s.companyId}_${normalizePolicyKey(
    s.policyNumberKey
  )}_${toPadded9(s.customerId)}_${s.templateId}`;
}

/* ---------- concurrency helper ---------- */

async function runInChunks<T, R>(
  items: T[],
  chunkSize: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    const slice = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(slice.map(worker));
    results.push(...chunkResults);
  }

  return results;
}

/* ---------- process one group ---------- */

async function processGroup(params: {
  db: any;
  rows: any[];
  runId: string;
}) {
  const { db, rows, runId } = params;

  const first = rows[0];

  const key = {
    agentId: first.agentId,
    agentCode: normalizeAgentCode(first.agentCode),
    reportMonth: sanitizeMonth(first.reportMonth),
    templateId: first.templateId,
    companyId: first.companyId,
  };

  const commissionId = buildCommissionSummaryId(key);

  const existingSnap = await getDoc(doc(db, "commissionSummaries", commissionId));

  /* =========================
     FAST PATH
  ========================= */
  if (!existingSnap.exists()) {
    const policyMap = new Map();

    let totalCommission = 0;
    let totalPremium = 0;

    for (const row of rows) {
      const commission = Number(row.commissionAmount ?? 0);
      const premium = Number(row.premium ?? 0);

      totalCommission += commission;
      totalPremium += premium;

      const policyKey = buildPolicySummaryId({
        ...key,
        policyNumberKey: row.policyNumberKey,
        customerId: row.customerId,
      });

      if (!policyMap.has(policyKey)) {
        policyMap.set(policyKey, {
          ...key,
          company: row.company,
          policyNumberKey: row.policyNumberKey,
          customerId: row.customerId,
          validMonth: row.validMonth ? sanitizeMonth(row.validMonth) : undefined,
          totalCommissionAmount: 0,
          totalPremiumAmount: 0,
          rowsCount: 0,
          product: row.product ? String(row.product).trim() : undefined,
          fullName: row.fullName ? String(row.fullName).trim() : undefined,
          runId,
        });
      }

      const s = policyMap.get(policyKey);
      s.totalCommissionAmount += commission;
      s.totalPremiumAmount += premium;
      s.rowsCount += 1;

      if (!s.product && row.product) s.product = String(row.product).trim();
      if (!s.fullName && row.fullName) s.fullName = String(row.fullName).trim();
      if (!s.validMonth && row.validMonth) s.validMonth = sanitizeMonth(row.validMonth);
    }

    const policies = Array.from(policyMap.values());

    for (const p of policies) {
      const prem = Number(p.totalPremiumAmount ?? 0);
      const comm = Number(p.totalCommissionAmount ?? 0);
      p.commissionRate = prem > 0 ? roundTo2((comm / prem) * 100) : 0;
    }

    const commissionSummary = {
      ...key,
      company: first.company,
      totalCommissionAmount: totalCommission,
      totalPremiumAmount: totalPremium,
      runId,
    };

    return {
      commissionSummary,
      policySummaries: policies,
    };
  }

  /* =========================
     MERGE PATH
  ========================= */

  const q = query(
    collection(db, "policyCommissionSummaries"),
    where("agentId", "==", key.agentId),
    where("reportMonth", "==", key.reportMonth),
    where("templateId", "==", key.templateId),
    where("companyId", "==", key.companyId)
  );

  const snap = await getDocs(q);

  const existing = snap.docs
    .map((d) => d.data())
    .filter((r: any) => normalizeAgentCode(r.agentCode) === key.agentCode);

  const map = new Map<string, any>();

  for (const r of existing) {
    const id = buildPolicySummaryId(r);
    map.set(id, { ...r });
  }

  for (const row of rows) {
    const id = buildPolicySummaryId({
      ...key,
      policyNumberKey: row.policyNumberKey,
      customerId: row.customerId,
    });

    const commission = Number(row.commissionAmount ?? 0);
    const premium = Number(row.premium ?? 0);

    if (!map.has(id)) {
      map.set(id, {
        ...key,
        company: row.company,
        policyNumberKey: row.policyNumberKey,
        customerId: row.customerId,
        validMonth: row.validMonth ? sanitizeMonth(row.validMonth) : undefined,
        totalCommissionAmount: 0,
        totalPremiumAmount: 0,
        rowsCount: 0,
        product: row.product ? String(row.product).trim() : undefined,
        fullName: row.fullName ? String(row.fullName).trim() : undefined,
        runId,
      });
    }

    const s = map.get(id);
    s.totalCommissionAmount += commission;
    s.totalPremiumAmount += premium;
    s.rowsCount += 1;
    s.runId = runId;

    if (!s.product && row.product) s.product = String(row.product).trim();
    if (!s.fullName && row.fullName) s.fullName = String(row.fullName).trim();
    if (!s.validMonth && row.validMonth) s.validMonth = sanitizeMonth(row.validMonth);
  }

  const merged = Array.from(map.values());

  let totalCommission = 0;
  let totalPremium = 0;

  for (const p of merged) {
    const prem = Number(p.totalPremiumAmount ?? 0);
    const comm = Number(p.totalCommissionAmount ?? 0);

    totalCommission += comm;
    totalPremium += prem;
    p.commissionRate = prem > 0 ? roundTo2((comm / prem) * 100) : 0;
  }

  const commissionSummary = {
    ...key,
    company: first.company,
    totalCommissionAmount: totalCommission,
    totalPremiumAmount: totalPremium,
    runId,
  };

  return {
    commissionSummary,
    policySummaries: merged,
  };
}

/* ---------- main ---------- */

export async function recomputeSummariesFromExternalManual({
  db,
  rowsPrepared,
  runId,
}: any) {
  const groups = new Map<string, any[]>();

  for (const row of rowsPrepared) {
    const key = `${row.agentId}__${normalizeAgentCode(row.agentCode)}__${sanitizeMonth(
      row.reportMonth
    )}__${row.templateId}__${row.companyId}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const groupEntries = Array.from(groups.entries()).map(([groupKey, rows]) => ({
    groupKey,
    rows,
  }));

  console.log("[manualRecompute] groups =", groupEntries.length);

  const results = await runInChunks(
    groupEntries,
    5,
    async ({ rows }) =>
      processGroup({
        db,
        rows,
        runId,
      })
  );

  const finalCommissionSummaries = results.map((r) => r.commissionSummary);
  const finalPolicySummaries = results.flatMap((r) => r.policySummaries);

  /* ---------- write commission summaries ---------- */

  for (let i = 0; i < finalCommissionSummaries.length; i += 450) {
    const batch = writeBatch(db);

    for (const s of finalCommissionSummaries.slice(i, i + 450)) {
      const id = buildCommissionSummaryId(s);
      batch.set(
        doc(db, "commissionSummaries", id),
        stripUndefined({
          ...s,
          reportMonth: sanitizeMonth(s.reportMonth),
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
    }

    await batch.commit();
  }

  /* ---------- write policy summaries ---------- */

  for (let i = 0; i < finalPolicySummaries.length; i += 450) {
    const batch = writeBatch(db);

    for (const s of finalPolicySummaries.slice(i, i + 450)) {
      const id = buildPolicySummaryId(s);
      batch.set(
        doc(db, "policyCommissionSummaries", id),
        stripUndefined({
          ...s,
          agentCode: normalizeAgentCode(s.agentCode),
          reportMonth: sanitizeMonth(s.reportMonth),
          validMonth: s.validMonth ? sanitizeMonth(s.validMonth) : undefined,
          policyNumberKey: normalizePolicyKey(s.policyNumberKey),
          customerId: toPadded9(s.customerId),
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
    }

    await batch.commit();
  }

  return {
    commissionSummariesCount: finalCommissionSummaries.length,
    policySummariesCount: finalPolicySummaries.length,
  };
}