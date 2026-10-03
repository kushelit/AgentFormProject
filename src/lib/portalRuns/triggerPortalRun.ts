import { apiFetch } from '@/lib/apiFetch';
// src/lib/portalRuns/triggerPortalRun.ts

export type TriggerPortalRunResult = {
  ok?: boolean;
  runId?: string;
  skipped?: boolean;
  error?: string;
};

export async function triggerPortalRun(runId: string) {
  const res = await apiFetch(`/api/portal-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}
