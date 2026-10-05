// src/lib/fileLinks.ts
// Short-lived signed links for private files, issued by the server after a permission check
// (/api/files/signed-urls). Use instead of getDownloadURL, which creates permanent links.

import { apiFetch } from '@/lib/apiFetch';

async function requestLinks(body: Record<string, unknown>): Promise<Record<string, string>> {
  const res = await apiFetch('/api/files/signed-urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return {};
  const data = await res.json().catch(() => ({}));
  return data?.urls || {};
}

/** Links for customer / lead documents, keyed by document id ('' when not allowed or missing). */
export function getDocumentLinks(kind: 'customerDocuments' | 'leadDocuments', ids: string[]) {
  return ids.length ? requestLinks({ kind, ids }) : Promise.resolve({} as Record<string, string>);
}

/** Links for commission files (portalRuns / commission-imports), keyed by storagePath. */
export function getCommissionFileLinks(files: { bucket: string; storagePath: string }[]) {
  return files.length ? requestLinks({ kind: 'commissionFiles', files }) : Promise.resolve({} as Record<string, string>);
}
