import { ref, uploadBytes, getMetadata } from './storage-transport';
import { storagePath } from './policy';

export type ReportRecord = {
  key: string; runId: string; filename: string; bytes: Uint8Array;
  destination?: string; uploaded?: boolean; bucket?: string;
};
let opening: Promise<IDBDatabase> | undefined;
function database() {
  return opening ||= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('portal-runner-reports', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('reports', {keyPath: 'key'});
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function operation<T>(mode: IDBTransactionMode, make: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reports', mode), request = make(tx.objectStore('reports'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || request.error);
  });
}
export const putReport = (report: ReportRecord) => operation('readwrite', s => s.put(report));
export const getReport = (key: string) => operation<ReportRecord | undefined>('readonly', s => s.get(key));
export const allReports = () => operation<ReportRecord[]>('readonly', s => s.getAll());
export const removeReport = (key: string) => operation('readwrite', s => s.delete(key));
export async function clearRunReports(runId: string) {
  for (const r of await allReports()) if (r.runId === runId) await removeReport(r.key);
}
// Provider report keys identify IndexedDB records, never operating-system files.
export const reportPath = {
  join: (...parts: string[]) => parts.filter(Boolean).join('/'),
  basename: (key: string) => key.split('/').pop() || 'report.bin',
};
export async function uploadReport(params: {
  storage: any; reportKey: string; agentId: string; runId: string; subdir?: string;
}) {
  const record = await getReport(params.reportKey);
  if (!record || record.runId !== params.runId) throw new Error('REPORT_BYTES_MISSING');
  record.filename = reportPath.basename(params.reportKey);
  record.destination ||= storagePath(params.agentId, params.runId, params.subdir || '', reportPath.basename(params.reportKey));
  await putReport(record); // Commit intent and bytes before the network operation.
  await reconcileUpload(params.storage, record);
  return {storagePath: record.destination, filename: reportPath.basename(params.reportKey)};
}
export async function reconcileUpload(storage: any, record: ReportRecord) {
  if (!record.destination) return;
  if (/\.(ttf|otf|woff2?|eot|css|js|png|jpe?g|gif|svg|ico)$/i.test(record.filename))
    throw new Error('REPORT_IS_SITE_ASSET');
  const target = ref(storage, record.destination);
  if (!record.uploaded) {
    try {
      const metadata = await getMetadata(target);
      if (metadata.customMetadata?.reportKey !== record.key || metadata.size !== record.bytes.byteLength)
        throw new Error('REPORT_DESTINATION_CONFLICT');
    } catch (e: any) {
      if (e.code !== 'storage/object-not-found') throw e;
      const type = /\.zip$/i.test(record.filename) ? 'application/zip' : /\.csv$/i.test(record.filename) ? 'text/csv' :
        /\.xlsx$/i.test(record.filename) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream';
      await uploadBytes(target, record.bytes, {contentType: type, customMetadata: {reportKey: record.key, runId: record.runId}});
    }
    record.uploaded = true;
    record.bucket = target.bucket;
    await putReport(record);
  }
}
