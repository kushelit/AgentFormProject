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

/* ---------- IDs ---------- */

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

/* ---------- MAIN ---------- */

export async function recomputeSummariesFromExternalManual({
  db,
  rowsPrepared,
  runId,
}: any) {
  const groups = new Map<string, any>();

  for (const row of rowsPrepared) {
    const key = `${row.agentId}__${row.agentCode}__${sanitizeMonth(
      row.reportMonth
    )}__${row.templateId}__${row.companyId}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const finalCommissionSummaries: any[] = [];
  const finalPolicySummaries: any[] = [];

  for (const [_, rows] of groups.entries()) {
    const first = rows[0];

    const key = {
      agentId: first.agentId,
      agentCode: normalizeAgentCode(first.agentCode),
      reportMonth: sanitizeMonth(first.reportMonth),
      templateId: first.templateId,
      companyId: first.companyId,
    };

    const commissionId = buildCommissionSummaryId(key);

    const existingSnap = await getDoc(
      doc(db, "commissionSummaries", commissionId)
    );

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
            totalCommissionAmount: 0,
            totalPremiumAmount: 0,
            rowsCount: 0,
            runId,
          });
        }

        const s = policyMap.get(policyKey);
        s.totalCommissionAmount += commission;
        s.totalPremiumAmount += premium;
        s.rowsCount += 1;
      }

      const policies = Array.from(policyMap.values());

      for (const p of policies) {
        const prem = Number(p.totalPremiumAmount ?? 0);
        const comm = Number(p.totalCommissionAmount ?? 0);
        p.commissionRate = prem > 0 ? roundTo2((comm / prem) * 100) : 0;
      }

      finalPolicySummaries.push(...policies);

      finalCommissionSummaries.push({
        ...key,
        company: first.company,
        totalCommissionAmount: totalCommission,
        totalPremiumAmount: totalPremium,
        runId,
      });

      continue;
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
      .filter(
        (r: any) =>
          normalizeAgentCode(r.agentCode) === key.agentCode
      );

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
          totalCommissionAmount: 0,
          totalPremiumAmount: 0,
          rowsCount: 0,
          runId,
        });
      }

      const s = map.get(id);
      s.totalCommissionAmount += commission;
      s.totalPremiumAmount += premium;
      s.rowsCount += 1;
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

    finalPolicySummaries.push(...merged);

    finalCommissionSummaries.push({
      ...key,
      company: first.company,
      totalCommissionAmount: totalCommission,
      totalPremiumAmount: totalPremium,
      runId,
    });
  }

  /* ---------- write ---------- */

  for (let i = 0; i < finalCommissionSummaries.length; i += 450) {
    const batch = writeBatch(db);
    for (const s of finalCommissionSummaries.slice(i, i + 450)) {
      const id = buildCommissionSummaryId(s);
      batch.set(
        doc(db, "commissionSummaries", id),
        { ...stripUndefined(s), updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
    await batch.commit();
  }

  for (let i = 0; i < finalPolicySummaries.length; i += 450) {
    const batch = writeBatch(db);
    for (const s of finalPolicySummaries.slice(i, i + 450)) {
      const id = buildPolicySummaryId(s);
      batch.set(
        doc(db, "policyCommissionSummaries", id),
        { ...stripUndefined(s), updatedAt: serverTimestamp() },
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