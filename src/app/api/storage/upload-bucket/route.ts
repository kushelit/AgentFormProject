// app/api/storage/upload-bucket/route.ts
// לאיזה באקט להעלות מהדפדפן. NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET יכול להיות בשם הישן (*.appspot.com)
// כשבפרויקט קיים רק *.firebasestorage.app (או להפך) — העלאה לבאקט שלא קיים נתקעת בניסיונות חוזרים.
// השרת בודק איזה מהשניים קיים ומחזיר אותו.

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { getAuthUser } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cached = '';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (cached) return NextResponse.json({ bucket: cached });

  const raw = String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '').trim().replace(/^gs:\/\//, '');
  const candidates = [raw];
  if (raw.endsWith('.appspot.com')) candidates.push(raw.replace('.appspot.com', '.firebasestorage.app'));
  if (raw.endsWith('.firebasestorage.app')) candidates.push(raw.replace('.firebasestorage.app', '.appspot.com'));

  for (const name of candidates.filter(Boolean)) {
    try {
      const [exists] = await admin.storage().bucket(name).exists();
      if (exists) {
        cached = name;
        return NextResponse.json({ bucket: name });
      }
    } catch {
      // לא נגיש — מנסים את השם השני
    }
  }
  return NextResponse.json({ error: 'לא נמצא באקט אחסון' }, { status: 500 });
}
