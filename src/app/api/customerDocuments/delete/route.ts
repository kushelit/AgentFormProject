export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: Request) {
  try {
    const { documentId } = await req.json();

    if (!documentId) {
      return NextResponse.json({ ok: false, error: 'Missing documentId' }, { status: 400 });
    }

    const db = admin.firestore();
    const docRef = db.collection('customerDocuments').doc(documentId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Document not found' }, { status: 404 });
    }

    const data = docSnap.data();
    const bucketName = String(data?.bucket || '').trim();
    const storagePath = String(data?.storagePath || '').trim();

    if (bucketName && storagePath) {
      try {
        await admin.storage().bucket(bucketName).file(storagePath).delete();
      } catch (err: any) {
        // אם הקובץ כבר לא קיים ב-Storage, נמשיך למחוק את הרשומה בכל זאת
        console.error('Storage delete warning:', err?.message);
      }
    }

    await docRef.delete();

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('CUSTOMER DOCUMENT DELETE ERROR:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}