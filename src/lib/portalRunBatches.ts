import {
  Firestore,
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

export type BatchCompany = {
  id: string;
  name: string;
  companyAutomationClass?: string;
  portalId?: string;
  automationEnabled?: boolean;
  companyAutoDownloadEnabled?: boolean;
  companyAutoDownloadMessage?: string;
};

type CreatePortalBatchInput = {
  db: Firestore;
  agentId: string;
  companies: BatchCompany[];
  monthLabel?: string;
  source?: string;
  triggeredFrom?: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

export async function createPortalRunBatch({
  db,
  agentId,
  companies,
  monthLabel = "previous_month",
  source = "portalRunner",
  triggeredFrom = "ui_batch",
}: CreatePortalBatchInput) {
  if (!agentId) throw new Error("Missing agentId");
  if (!companies.length) throw new Error("No companies selected");

  const batchRef = doc(collection(db, "portalRunBatches"));
  const wb = writeBatch(db);
  const runIds: string[] = [];

  wb.set(batchRef, {
    batchId: batchRef.id,
    agentId,
    status: "queued",
    mode: "sequential",
    monthLabel,
    totalCount: companies.length,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source,
    triggeredFrom,
    companyIds: companies.map((c) => s(c.id)),
    companyNames: companies.map((c) => s(c.name)),
  });

  companies.forEach((company, index) => {
    const companyId = s(company.id);
    const portalId = s(company.portalId || companyId);
    const automationClass = s(company.companyAutomationClass);

    if (!companyId || !automationClass) return;

    const runRef = doc(collection(db, "portalImportRuns"));
    runIds.push(runRef.id);

    wb.set(runRef, {
      runId: runRef.id,
      agentId,
      companyId,
      companyName: s(company.name),
      templateId: `bundle_${portalId}_commissions`,
      automationClass,
      monthLabel,
      source,
      triggeredFrom,
      status: "queued",
      step: "queued",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      otp: {
        mode: "firestore",
        state: "none",
        value: "",
      },

      batchId: batchRef.id,
      batchMode: "sequential",
      batchOrder: index + 1,
      batchTotal: companies.length,
    });
  });

  await wb.commit();

  return {
    batchId: batchRef.id,
    runIds,
  };
}