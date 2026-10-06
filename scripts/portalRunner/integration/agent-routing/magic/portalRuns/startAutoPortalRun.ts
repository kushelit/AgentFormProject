import { collection, doc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { resolvePortalExecutor } from './portalExecutor';

export type StartAutoPortalRunParams = {
  db: Firestore;
  agentId: string;
  companyId: string;
  templateId: string;
  automationClass: string;
  monthLabel?: string;
  source?: 'portalRunner';
  triggeredFrom?: 'ui';
  /** Retained for callers; the agent preference determines the actual reservation. */
  reservedRunnerId?: string;
};

export async function startAutoPortalRun(params: StartAutoPortalRunParams) {
  const { db, agentId, companyId, templateId, automationClass,
    monthLabel = 'previous_month', source = 'portalRunner', triggeredFrom = 'ui' } = params;
  const ac = String(automationClass || '').trim();
  if (!agentId || !companyId || !templateId) throw new Error('Missing agentId/companyId/templateId');
  if (!ac) throw new Error('Missing automationClass');
  const executor = await resolvePortalExecutor(db, agentId);
  const runRef = doc(collection(db, 'portalImportRuns'));
  await setDoc(runRef, {
    runId: runRef.id, agentId, companyId, templateId, automationClass: ac, monthLabel,
    status: 'queued', step: 'queued', source, triggeredFrom, ...executor,
    otp: { mode: 'firestore', state: 'none' },
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return { runId: runRef.id };
}
