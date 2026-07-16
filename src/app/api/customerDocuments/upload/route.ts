export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

function buildBucketCandidates(rawBucket: string) {
  const clean = String(rawBucket || '').trim().replace(/^gs:\/\//, '');
  const candidates = new Set<string>();

  if (clean) candidates.add(clean);

  if (clean.endsWith('.appspot.com')) {
    candidates.add(clean.replace('.appspot.com', '.firebasestorage.app'));
  }
  if (clean.endsWith('.firebasestorage.app')) {
    candidates.add(clean.replace('.firebasestorage.app', '.appspot.com'));
  }

  return Array.from(candidates);
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const customerId = String(formData.get('customerId') || '').trim();
    const file = formData.get('file') as File | null;

    if (!customerId) {
      return NextResponse.json({ ok: false, error: 'Missing customerId' }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ ok: false, error: 'Missing file' }, { status: 400 });
    }

    const db = admin.firestore();

    const rawBucket =
      process.env.FIREBASE_STORAGE_BUCKET ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      '';

    const bucketCandidates = buildBucketCandidates(rawBucket);

    if (!bucketCandidates.length) {
      return NextResponse.json({ ok: false, error: 'Missing storage bucket env' }, { status: 500 });
    }

    const existingSnap = await db
      .collection('customerDocuments')
      .where('customerId', '==', customerId)
      .where('fileName', '==', file.name)
      .where('size', '==', file.size)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        documentId: existingSnap.docs[0].id,
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeFileName = file.name.replace(/[^\w.\-א-ת ]/g, '_');
    const storagePath = `customerFiles/manual/${customerId}/${Date.now()}-${safeFileName}`;

    let uploadedToBucket = '';
    let lastUploadError: any = null;

    for (const candidate of bucketCandidates) {
      try {
        const bucket = admin.storage().bucket(candidate);
        const storageFile = bucket.file(storagePath);

        await storageFile.save(buffer, {
          metadata: {
            contentType: file.type || 'application/octet-stream',
          },
        });

        uploadedToBucket = candidate;
        break;
      } catch (err: any) {
        lastUploadError = err;
      }
    }

    if (!uploadedToBucket) {
      return NextResponse.json(
        { ok: false, error: `Upload failed for all buckets: ${bucketCandidates.join(', ')}` },
        { status: 500 }
      );
    }

    const docRef = await db.collection('customerDocuments').add({
      customerId,
      sourceSystem: 'manual',
      fileName: file.name,
      mimeType: file.type || '',
      size: file.size || 0,
      storagePath,
      bucket: uploadedToBucket,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      documentId: docRef.id,
      fileName: file.name,
      storagePath,
      bucket: uploadedToBucket,
    });
  } catch (error: any) {
    console.error('CUSTOMER DOCUMENT UPLOAD ERROR:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}