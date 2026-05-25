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

function prevMonthOf(ym: string) {
  const [y, m] = String(ym || "").split("-").map(Number);
  if (!y || !m) return "";
  const d = new Date(y, m - 2, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

function policyKey(row: any) {
  return [
    s(row.policyNumberKey),
    s(row.customerId),
    s(row.templateId),
    s(row.companyId),
  ].join("__");
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
  hasPrevMonth: boolean;
  previousMonth: string;
  deltaCommissionAmount: number;
  deltaCommissionPercent: number;
  newPoliciesCount: number;
  droppedPoliciesCount: number;
  droppedPoliciesTop: Array<{
    policyNumberKey: string;
    customerId: string;
    fullName: string;
    product: string;
    previousCommissionAmount: number;
  }>;
  newPoliciesTop: Array<{
    policyNumberKey: string;
    customerId: string;
    fullName: string;
    product: string;
    currentCommissionAmount: number;
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

  const currentMonth = s(run.maxReportMonth) || (reportMonths.length ? reportMonths[reportMonths.length - 1] : "");
  const previousMonth = prevMonthOf(currentMonth);

  const currentRows: any[] = [];
  for (const reportMonth of reportMonths) {
    const q = db
      .collection("policyCommissionSummaries")
      .where("agentId", "==", agentId)
      .where("companyId", "==", companyId)
      .where("templateId", "==", templateId)
      .where("reportMonth", "==", reportMonth);
    const snap = await q.get();
    for (const d of snap.docs) currentRows.push(d.data());
  }

  const prevRows: any[] = [];
  if (previousMonth) {
    const prevQ = db
      .collection("policyCommissionSummaries")
      .where("agentId", "==", agentId)
      .where("companyId", "==", companyId)
      .where("templateId", "==", templateId)
      .where("reportMonth", "==", previousMonth);
    const prevSnap = await prevQ.get();
    for (const d of prevSnap.docs) prevRows.push(d.data());
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

  for (const row of currentRows) {
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

  const currentMap = new Map<string, any>();
  const prevMap = new Map<string, any>();

  for (const row of currentRows.filter((r) => s(r.reportMonth) === currentMonth)) {
    currentMap.set(policyKey(row), row);
  }
  for (const row of prevRows) {
    prevMap.set(policyKey(row), row);
  }

  const currentCommissionThisMonth = currentRows
    .filter((r) => s(r.reportMonth) === currentMonth)
    .reduce((sum, r) => sum + n(r.totalCommissionAmount), 0);

  const previousCommissionThisMonth = prevRows.reduce(
    (sum, r) => sum + n(r.totalCommissionAmount),
    0
  );

  const deltaCommissionAmount = roundTo2(currentCommissionThisMonth - previousCommissionThisMonth);
  const deltaCommissionPercent =
    previousCommissionThisMonth > 0
      ? roundTo2((deltaCommissionAmount / previousCommissionThisMonth) * 100)
      : 0;

  const droppedPoliciesTop: Array<{
    policyNumberKey: string;
    customerId: string;
    fullName: string;
    product: string;
    previousCommissionAmount: number;
  }> = [];

  const newPoliciesTop: Array<{
    policyNumberKey: string;
    customerId: string;
    fullName: string;
    product: string;
    currentCommissionAmount: number;
  }> = [];

  for (const [key, prevRow] of prevMap.entries()) {
    const currRow = currentMap.get(key);
    const prevComm = n(prevRow.totalCommissionAmount);
    const currComm = currRow ? n(currRow.totalCommissionAmount) : 0;
    if (prevComm > 0 && currComm === 0) {
      droppedPoliciesTop.push({
        policyNumberKey: s(prevRow.policyNumberKey),
        customerId: s(prevRow.customerId),
        fullName: s(prevRow.fullName),
        product: s(prevRow.product),
        previousCommissionAmount: prevComm,
      });
    }
  }

  for (const [key, currRow] of currentMap.entries()) {
    if (!prevMap.has(key)) {
      newPoliciesTop.push({
        policyNumberKey: s(currRow.policyNumberKey),
        customerId: s(currRow.customerId),
        fullName: s(currRow.fullName),
        product: s(currRow.product),
        currentCommissionAmount: n(currRow.totalCommissionAmount),
      });
    }
  }

  droppedPoliciesTop.sort((a, b) => b.previousCommissionAmount - a.previousCommissionAmount);
  newPoliciesTop.sort((a, b) => b.currentCommissionAmount - a.currentCommissionAmount);

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
    totalPolicies: currentRows.length,
    totalCustomers: uniqueCustomers.size,
    totalCommissionAmount: roundTo2(totalCommissionAmount),
    totalPremiumAmount: roundTo2(totalPremiumAmount),
    zeroCommissionPoliciesCount: zeroCommissionPolicies.length,
    zeroCommissionPoliciesTop: zeroCommissionPolicies.slice(0, 10),
    previousMonth,
    deltaCommissionAmount,
    deltaCommissionPercent,
    newPoliciesCount: newPoliciesTop.length,
    droppedPoliciesCount: droppedPoliciesTop.length,
    droppedPoliciesTop: droppedPoliciesTop.slice(0, 10),
    newPoliciesTop: newPoliciesTop.slice(0, 10),
    hasPrevMonth: prevRows.length > 0,
  };
}

async function buildPrevMonthSummary(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  bundleTemplateId: string;
  prevYm: string;
}): Promise<{ totalPolicies: number; totalCustomers: number; totalCommissionAmount: number; totalPremiumAmount: number } | null> {
  const { db, agentId, bundleTemplateId, prevYm } = params;

  const lockId = `${agentId}_${bundleTemplateId}_${prevYm}`;
  const lockSnap = await db.collection("portalImportLocks").doc(lockId).get();
  if (!lockSnap.exists) return null;

  const lockRunId = s(lockSnap.data()?.runId);
  if (!lockRunId) return null;

  const prevRunSnap = await db.collection("portalImportRuns").doc(lockRunId).get();
  if (!prevRunSnap.exists) return null;

  const prevJobIds: string[] = Array.isArray(prevRunSnap.data()?.queue?.jobIds)
    ? prevRunSnap.data()!.queue.jobIds
    : [];

  if (!prevJobIds.length) return null;

  const prevRows: any[] = [];
  for (const jobId of prevJobIds) {
    const snap = await db.collection("policyCommissionSummaries").where("runId", "==", jobId).get();
    for (const d of snap.docs) prevRows.push(d.data());
  }

  const uniqueCustomers = new Set<string>();
  let totalCommissionAmount = 0;
  let totalPremiumAmount = 0;

  for (const row of prevRows) {
    const customerId = s(row.customerId);
    if (customerId) uniqueCustomers.add(customerId);
    totalCommissionAmount += n(row.totalCommissionAmount);
    totalPremiumAmount += n(row.totalPremiumAmount);
  }

  return {
    totalPolicies: prevRows.length,
    totalCustomers: uniqueCustomers.size,
    totalCommissionAmount: roundTo2(totalCommissionAmount),
    totalPremiumAmount: roundTo2(totalPremiumAmount),
  };
}

export async function buildImportInsightsForPortalRun(portalRunId: string): Promise<ImportInsights> {
  ensureAdminApp();
  const db = adminDb();

  const portalRunSnap = await db.collection("portalImportRuns").doc(portalRunId).get();
  if (!portalRunSnap.exists) throw new Error(`portalImportRun not found: ${portalRunId}`);

  const portalRun = portalRunSnap.data() || {};
  const jobIds: string[] = Array.isArray(portalRun?.queue?.jobIds) ? portalRun.queue.jobIds : [];
  if (!jobIds.length) throw new Error(`portalImportRun ${portalRunId} has no jobIds`);

  const agentId = s(portalRun.agentId);
  const companyId = s(portalRun.companyId);
  const companyName = s(portalRun.companyName);
  const bundleTemplateId = s(portalRun.templateId);
  const lockMonth = s(portalRun?.resolvedWindow?.ym);

  const allRows: any[] = [];
  for (const jobId of jobIds) {
    const snap = await db.collection("policyCommissionSummaries").where("runId", "==", jobId).get();
    for (const d of snap.docs) allRows.push(d.data());
  }

  const uniqueCustomers = new Set<string>();
  let totalCommissionAmount = 0;
  let totalPremiumAmount = 0;
  const zeroCommissionPolicies: any[] = [];

  for (const row of allRows) {
    const customerId = s(row.customerId);
    if (customerId) uniqueCustomers.add(customerId);
    const comm = n(row.totalCommissionAmount);
    const prem = n(row.totalPremiumAmount);
    totalCommissionAmount += comm;
    totalPremiumAmount += prem;
    if (comm === 0) {
      zeroCommissionPolicies.push({
        policyNumberKey: s(row.policyNumberKey),
        customerId,
        fullName: s(row.fullName),
        product: s(row.product),
        totalPremiumAmount: prem,
      });
    }
  }
  zeroCommissionPolicies.sort((a, b) => b.totalPremiumAmount - a.totalPremiumAmount);

  const reportMonthsSet = new Set<string>();
  for (const row of allRows) {
    const rm = s(row.reportMonth);
    if (rm) reportMonthsSet.add(rm);
  }
  const reportMonths = Array.from(reportMonthsSet).sort();

  const [ly, lm] = lockMonth.split('-').map(Number);
  const prevYmDate = new Date(ly, lm - 2, 1);
  const prevYm = lockMonth
    ? `${prevYmDate.getFullYear()}-${String(prevYmDate.getMonth() + 1).padStart(2, '0')}`
    : '';

  const prevSummary = prevYm && bundleTemplateId
    ? await buildPrevMonthSummary({ db, agentId, bundleTemplateId, prevYm })
    : null;

  const totalPolicies = allRows.length;
  const totalCustomers = uniqueCustomers.size;
  const currentCommission = roundTo2(totalCommissionAmount);
  const currentPremium = roundTo2(totalPremiumAmount);

  const deltaCommissionAmount = prevSummary
    ? roundTo2(currentCommission - prevSummary.totalCommissionAmount)
    : 0;
  const deltaCommissionPercent = prevSummary && prevSummary.totalCommissionAmount > 0
    ? roundTo2((deltaCommissionAmount / prevSummary.totalCommissionAmount) * 100)
    : 0;

  return {
    runId: portalRunId,
    agentId,
    agentName: '',
    companyId,
    company: companyName,
    templateId: bundleTemplateId,
    templateName: companyName,
    reportMonths,
    minReportMonth: reportMonths[0] || '',
    maxReportMonth: reportMonths[reportMonths.length - 1] || '',
    totalPolicies,
    totalCustomers,
    totalCommissionAmount: currentCommission,
    totalPremiumAmount: currentPremium,
    zeroCommissionPoliciesCount: zeroCommissionPolicies.length,
    zeroCommissionPoliciesTop: zeroCommissionPolicies.slice(0, 10),
    previousMonth: prevYm,
    deltaCommissionAmount,
    deltaCommissionPercent,
    newPoliciesCount: prevSummary ? Math.max(0, totalPolicies - prevSummary.totalPolicies) : 0,
    droppedPoliciesCount: 0,
    droppedPoliciesTop: [],
    newPoliciesTop: [],
   hasPrevMonth: prevSummary !== null,

  };
}