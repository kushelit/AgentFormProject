import { doc, getDoc, type Firestore } from 'firebase/firestore';

export type PortalExecutionMode = 'runner' | 'extension';

export function parsePortalExecutionMode(value: unknown): PortalExecutionMode {
  if (value === undefined || value === null || value === '') return 'runner';
  if (value === 'runner' || value === 'extension') return value;
  throw new Error('הגדרת אופן ההרצה של הסוכן אינה תקינה');
}

export function portalStatusCollection(mode: PortalExecutionMode) {
  return mode === 'extension' ? 'portalExtensionStatus' : 'portalRunnerStatus';
}

export function portalExecutorOnline(mode: PortalExecutionMode, data: any, now = Date.now()) {
  const id = String(data?.runnerId || '').trim();
  const lastSeen = data?.lastSeenAt?.toMillis?.() ?? data?.lastSeenAt?.toDate?.()?.getTime?.();
  const correctType = mode === 'extension'
    ? id.startsWith('chrome-') && data?.runnerType === 'chrome-extension'
    : !!id && !id.startsWith('chrome-');
  // Extension presence runs every 30 seconds: allow two missed ticks and jitter.
  const maxAge = mode === 'extension' ? 90_000 : 30_000;
  return correctType && data?.isOnline !== false && Number.isFinite(lastSeen) &&
    now - lastSeen >= -5_000 && now - lastSeen < maxAge;
}

export async function resolvePortalExecutor(db: Firestore, agentId: string) {
  if (!agentId) throw new Error('חסר מזהה סוכן');
  const user = await getDoc(doc(db, 'users', agentId));
  if (!user.exists()) throw new Error('לא נמצאה רשומת הסוכן');
  const executionMode = parsePortalExecutionMode(user.data()?.portalExecutionMode);
  const status = await getDoc(doc(db, portalStatusCollection(executionMode), agentId));
  const data = status.data();
  if (!status.exists() || !portalExecutorOnline(executionMode, data))
    throw new Error(executionMode === 'extension'
      ? 'תוסף Chrome של הסוכן אינו מחובר או שהוא מושהה'
      : 'ה־Runner של הסוכן אינו מחובר');
  return { executionMode, reservedRunnerId: String(data!.runnerId).trim() };
}
