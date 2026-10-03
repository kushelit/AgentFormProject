import { collection, doc, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore';
import { resolvePortalExecutor } from './portalRuns/portalExecutor';

export type BatchCompany = {
  id: string; name: string; companyAutomationClass?: string; portalId?: string;
  automationEnabled?: boolean; companyAutoDownloadEnabled?: boolean;
  companyAutoDownloadMessage?: string; requestedReportMonth?: string;
};
type CreatePortalBatchInput = {
  db: Firestore; agentId: string; companies: BatchCompany[];
  monthLabel?: string; source?: string; triggeredFrom?: string; reservedRunnerId?: string;
};
const s = (value: unknown) => String(value ?? '').trim();

export async function createPortalRunBatch({ db, agentId, companies,
  monthLabel = 'previous_month', source = 'portalRunner', triggeredFrom = 'ui_batch',
}: CreatePortalBatchInput) {
  if (!agentId) throw new Error('Missing agentId');
  if (!companies.length) throw new Error('No companies selected');
  // Reject invalid input rather than create gaps in a sequential batch.
  if (companies.some(c => !s(c.id) || !s(c.companyAutomationClass)))
    throw new Error('Missing companyId/automationClass');
  if (companies.length > 499) throw new Error('Too many companies');
  const executor = await resolvePortalExecutor(db, agentId);
  const batchRef = doc(collection(db, 'portalRunBatches'));
  const wb = writeBatch(db);
  const runIds: string[] = [];
  wb.set(batchRef, {
    batchId: batchRef.id, agentId, status: 'queued', mode: 'sequential', monthLabel,
    totalCount: companies.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    source, triggeredFrom, companyIds: companies.map(c => s(c.id)),
    companyNames: companies.map(c => s(c.name)), ...executor,
  });
  companies.forEach((company, index) => {
    const runRef = doc(collection(db, 'portalImportRuns'));
    runIds.push(runRef.id);
    wb.set(runRef, {
      runId: runRef.id, agentId, companyId: s(company.id), companyName: s(company.name),
      templateId: `bundle_${s(company.portalId || company.id)}_commissions`,
      automationClass: s(company.companyAutomationClass), monthLabel, source, triggeredFrom,
      status: 'queued', step: 'queued', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      otp: { mode: 'firestore', state: 'none', value: '' },
      batchId: batchRef.id, batchMode: 'sequential', batchOrder: index + 1, batchTotal: companies.length,
      ...(company.requestedReportMonth ? { requestedReportMonth: company.requestedReportMonth } : {}),
      ...executor,
    });
  });
  await wb.commit();
  return { batchId: batchRef.id, runIds };
}
