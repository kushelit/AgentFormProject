// app/api/hekef-upload/route.ts
// טעינה ידנית של דוח היקף: הקובץ (כמו שירד מהפורטל — ZIP / XLS) כבר הועלה מהדפדפן ל-
// commission-imports/{agentId}/hekef/... (תיקיית הסוכן, כמו portalRuns), וכאן נפתחת ריצה ב-portalImportRuns עם downloads[] — בדיוק כמו
// הורדה של ה-Runner. enqueueCommissionImportFromPortalRun + processCommissionImportQueue מטפלים בשאר,
// כך שהטעינה זהה לאוטומטית (תבנית, חוקי היקף, דף חשבון של כלל, ש"ק מאותו קובץ).
//
// ⚠️ חוסם תמיד (גם במצב log של API_AUTH_MODE): זו כתיבה לנתוני סוכן.

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { canAccessAgent, getAuthUser } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const s = (v: unknown) => String(v ?? '').trim();
const MAX_BYTES = 100 * 1024 * 1024;

function bucketCandidates(): string[] {
  const raw = s(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).replace(/^gs:\/\//, '');
  const out = new Set<string>();
  if (raw) out.add(raw);
  if (raw.endsWith('.appspot.com')) out.add(raw.replace('.appspot.com', '.firebasestorage.app'));
  if (raw.endsWith('.firebasestorage.app')) out.add(raw.replace('.firebasestorage.app', '.appspot.com'));
  return [...out];
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const agentId = s(body?.agentId);
  const templateId = s(body?.templateId);
  const storagePath = s(body?.storagePath);
  const filename = s(body?.filename).slice(0, 200);

  if (!agentId || !templateId || !storagePath) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
  }
  if (!(await canAccessAgent(user, agentId))) {
    console.warn('[hekef-upload] blocked', user.uid, '→', agentId);
    return NextResponse.json({ error: 'אין הרשאה לטעון לסוכן הזה' }, { status: 403 });
  }
  // רק קובץ בתיקיית ההיקף של הסוכן שנבחר (שאליו כבר נבדקה הרשאה)
  if (!storagePath.startsWith(`commission-imports/${agentId}/hekef/`) || storagePath.includes('..')) {
    return NextResponse.json({ error: 'נתיב קובץ לא תקין' }, { status: 400 });
  }

  const db = admin.firestore();

  // תבנית היקף פעילה. ש"ק של כלל (fromDownloadOf = תבנית היקף אחרת) נטען מאותו קובץ — מתחילים מהתבנית הראשית
  const tSnap = await db.collection('commissionTemplates').doc(templateId).get();
  const t = tSnap.data();
  if (!tSnap.exists || t?.isactive !== true || s(t?.hekefType) !== 'hekef_commission') {
    return NextResponse.json({ error: 'זו לא תבנית היקף פעילה' }, { status: 400 });
  }
  let rootTemplateId = templateId;
  const parentId = s(t?.fromDownloadOf);
  if (parentId) {
    const p = (await db.collection('commissionTemplates').doc(parentId).get()).data();
    if (p?.isactive === true && s(p?.hekefType) === 'hekef_commission') rootTemplateId = parentId;
  }
  const companyId = s(t?.companyId);

  // הקובץ קיים ובגודל סביר
  let bucketName = '';
  for (const name of bucketCandidates()) {
    try {
      const [meta] = await admin.storage().bucket(name).file(storagePath).getMetadata();
      if (Number(meta.size || 0) > MAX_BYTES) return NextResponse.json({ error: 'הקובץ גדול מדי' }, { status: 400 });
      bucketName = name;
      break;
    } catch {
      // לא בבאקט הזה — מנסים את השם השני
    }
  }
  if (!bucketName) return NextResponse.json({ error: 'הקובץ לא נמצא באחסון' }, { status: 400 });

  const companyName = s((await db.collection('company').doc(companyId).get()).data()?.companyName);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const runRef = db.collection('portalImportRuns').doc();

  await runRef.set({
    runId: runRef.id,
    agentId,
    companyId,
    companyName,
    templateId: rootTemplateId,
    automationClass: 'manual_hekef_upload',
    source: 'manual_upload',
    triggeredFrom: 'ui_manual_hekef',
    executionMode: 'manual',
    uploadedBy: user.uid,
    status: 'file_uploaded',
    step: 'manual_upload',
    monthLabel: '',
    downloads: [{ templateId: rootTemplateId, bucket: bucketName, storagePath, filename: filename || storagePath.split('/').pop() }],
    createdAt: now,
    updatedAt: now,
  });
  // המעבר ל-done הוא מה שמפעיל את enqueueCommissionImportFromPortalRun (כמו בסיום ריצת Runner)
  await runRef.update({ status: 'done', step: 'manual_upload_done', result: { uploaded: true }, updatedAt: now });

  return NextResponse.json({ ok: true, runId: runRef.id, templateId: rootTemplateId });
}
