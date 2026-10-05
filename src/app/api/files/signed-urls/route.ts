// app/api/files/signed-urls/route.ts
// Short-lived signed URLs for private files, after a per-agent permission check.
// Replaces client getDownloadURL (which creates permanent token links that bypass rules).
//
// Body:
//   { kind: 'customerDocuments' | 'leadDocuments', ids: string[] }
//       → owner = the document's AgentId
//   { kind: 'commissionFiles', files: { bucket: string, storagePath: string }[] }
//       → only portalRuns/{agentUid}/... or commission-imports/{agentUid}/...; owner = agentUid.
//         Workers have no access to commission files.
// Response: { urls: Record<string, string> } keyed by document id / storagePath ('' = not allowed / missing).
// Always enforced (not subject to API_AUTH_MODE log mode).

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { canAccessAgent, getAuthUser } from '@/lib/server/auth';

const DOC_LINK_MINUTES = 15;     // a documents list stays open for a while
const COMMISSION_LINK_MINUTES = 5; // used immediately to download + zip
const MAX_ITEMS = 100;

const s = (v: unknown) => String(v ?? '').trim();

/** The project's own bucket (both name styles); never sign files in other buckets. */
function allowedBuckets(): Set<string> {
  const raw = s(process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).replace(/^gs:\/\//, '');
  const out = new Set<string>();
  if (!raw) return out;
  out.add(raw);
  if (raw.endsWith('.appspot.com')) out.add(raw.replace('.appspot.com', '.firebasestorage.app'));
  if (raw.endsWith('.firebasestorage.app')) out.add(raw.replace('.firebasestorage.app', '.appspot.com'));
  return out;
}

/** Older records may name the bucket *.appspot.com or *.firebasestorage.app — try both. */
async function sign(bucket: string, storagePath: string, minutes: number): Promise<string> {
  const names = [bucket];
  if (bucket.endsWith('.appspot.com')) names.push(bucket.replace('.appspot.com', '.firebasestorage.app'));
  if (bucket.endsWith('.firebasestorage.app')) names.push(bucket.replace('.firebasestorage.app', '.appspot.com'));
  for (const name of names) {
    try {
      const file = admin.storage().bucket(name).file(storagePath);
      const [exists] = await file.exists();
      if (!exists) continue;
      const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + minutes * 60_000 });
      return url;
    } catch {
      // bucket name not used in this project — try the other one
    }
  }
  return '';
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    const kind = s(body?.kind);
    const buckets = allowedBuckets();
    const urls: Record<string, string> = {};
    const accessCache = new Map<string, boolean>();
    const mayAccess = async (agentId: string) => {
      if (!accessCache.has(agentId)) accessCache.set(agentId, await canAccessAgent(user, agentId));
      return accessCache.get(agentId)!;
    };

    if (kind === 'customerDocuments' || kind === 'leadDocuments') {
      const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(s).filter((x: string) => x && !x.includes('/')) : [];
      if (!ids.length || ids.length > MAX_ITEMS) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
      const snaps = await admin.firestore().getAll(...ids.map((id) => admin.firestore().collection(kind).doc(id)));
      for (const snap of snaps) {
        const d = snap.data();
        urls[snap.id] = '';
        if (!d) continue;
        const owner = s(d.AgentId);
        const bucket = s(d.bucket).replace(/^gs:\/\//, '');
        const storagePath = s(d.storagePath);
        if (!owner || !storagePath || !buckets.has(bucket) || !(await mayAccess(owner))) continue;
        urls[snap.id] = await sign(bucket, storagePath, DOC_LINK_MINUTES);
      }
      return NextResponse.json({ urls });
    }

    if (kind === 'commissionFiles') {
      if (user.role === 'worker') return NextResponse.json({ error: 'אין הרשאה לקבצי עמלות' }, { status: 403 });
      const files: any[] = Array.isArray(body?.files) ? body.files : [];
      if (!files.length || files.length > MAX_ITEMS) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
      for (const f of files) {
        const storagePath = s(f?.storagePath);
        const bucket = s(f?.bucket).replace(/^gs:\/\//, '');
        urls[storagePath] = '';
        const parts = storagePath.split('/');
        const root = parts[0];
        const owner = parts[1] || '';
        if (!['portalRuns', 'commission-imports'].includes(root) || !owner || storagePath.includes('..')) continue;
        if (!buckets.has(bucket) || !(await mayAccess(owner))) continue;
        urls[storagePath] = await sign(bucket, storagePath, COMMISSION_LINK_MINUTES);
      }
      return NextResponse.json({ urls });
    }

    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  } catch (e) {
    console.error('[files/signed-urls]', e);
    return NextResponse.json({ error: 'שגיאה ביצירת קישור לקובץ' }, { status: 500 });
  }
}
