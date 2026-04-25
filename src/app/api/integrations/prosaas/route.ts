export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

const DEFAULT_STATUS_LEAD = 'JVhM7nnBrwNBfvrb4zH5';

// ---------------- utils ----------------

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

const clean = (v: any): string => {
  if (v === null || v === undefined) return '';
  return String(v).replace(/["]/g, '').trim();
};

const splitName = (fullName: any) => {
  const name = clean(fullName);
  const parts = name.split(/\s+/).filter(Boolean);

  return {
    firstNameCustomer: parts[0] || '',
    lastNameCustomer: parts.slice(1).join(' ') || '',
  };
};

const compactUpdate = (obj: Record<string, any>) => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
};

// ---------------- mapping ----------------

function mapProsaasToLead(payload: any) {
  const contact = payload?.contact || {};
  const fallbackName = splitName(contact.name || payload.full_name);

  return {
    firstNameCustomer:
      clean(contact.first_name) || fallbackName.firstNameCustomer,
    lastNameCustomer:
      clean(contact.last_name) || fallbackName.lastNameCustomer,
    phone: clean(contact.phone),
    mail: clean(contact.email),

    externalSystem: 'prosaas',
    externalBusinessId: clean(payload.business_id),
    externalLeadId: clean(payload.lead_id),
    externalRawPayload: payload,
  };
}

// ---------------- upsert lead ----------------

async function upsertProsaasLead(payload: any) {
  const db = admin.firestore();

  const leadData = mapProsaasToLead(payload);

  if (!leadData.externalBusinessId || !leadData.externalLeadId) {
    throw new Error('Missing business_id or lead_id');
  }

  if (!leadData.phone) {
    throw new Error('Missing phone');
  }

  const snap = await db
    .collection('leads')
    .where('externalSystem', '==', 'prosaas')
    .where('externalBusinessId', '==', leadData.externalBusinessId)
    .where('externalLeadId', '==', leadData.externalLeadId)
    .limit(1)
    .get();

  if (!snap.empty) {
    const ref = snap.docs[0].ref;

    await ref.set(
      {
        ...compactUpdate(leadData),
        lastUpdateDate: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { action: 'updated', leadId: ref.id };
  }

  const newRef = await db.collection('leads').add({
    ...leadData,
    createDate: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdateDate: admin.firestore.FieldValue.serverTimestamp(),
    selectedStatusLead: DEFAULT_STATUS_LEAD,
  });

  return { action: 'created', leadId: newRef.id };
}

// ---------------- save files ----------------

async function saveProsaasFilesToLead(
  leadId: string,
  files: File[],
  metadata: any
) {
  if (!files.length) return [];

  const db = admin.firestore();

  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!bucketName) {
    throw new Error('Missing storage bucket env');
  }

  const rawBucket =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  '';

const bucketCandidates = buildBucketCandidates(rawBucket);

if (!bucketCandidates.length) {
  throw new Error('Missing storage bucket env');
}

console.log('PROSAAS BUCKET CANDIDATES:', bucketCandidates);

  const savedFiles = [];

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeFileName = file.name.replace(/[^\w.\-א-ת ]/g, '_');
    const storagePath = `leadFiles/prosaas/${leadId}/${Date.now()}-${safeFileName}`;

   let uploadedToBucket = '';
let lastUploadError: any = null;

for (const candidate of bucketCandidates) {
  try {
    console.log('Trying bucket:', candidate);

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
    console.warn('Bucket upload failed:', candidate, err?.message || err);
    lastUploadError = err;
  }
}

if (!uploadedToBucket) {
  throw new Error(
    `Upload failed for all buckets: ${bucketCandidates.join(', ')}. Last error: ${
      lastUploadError?.message || String(lastUploadError)
    }`
  );
}
    const docRef = await db.collection('leadDocuments').add({
      leadId,
      sourceSystem: 'prosaas',
      externalBusinessId: String(metadata.business_id || ''),
      externalLeadId: String(metadata.lead_id || ''),
      fileName: file.name,
      mimeType: file.type || '',
      size: file.size || 0,
      storagePath,
      bucket: uploadedToBucket,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    savedFiles.push({
      documentId: docRef.id,
      fileName: file.name,
    });
  }

  return savedFiles;
}

// ---------------- handler ----------------

export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get('x-api-key');
    const expectedKey = process.env.PROSAAS_WEBHOOK_SECRET;

    if (!expectedKey) {
      return NextResponse.json(
        { ok: false, error: 'Server misconfigured' },
        { status: 500 }
      );
    }

    if (apiKey !== expectedKey) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const contentType = req.headers.get('content-type') || '';

    console.log('=== PROSAAS WEBHOOK START ===');
    console.log('Content-Type:', contentType);

    // -------- JSON --------
    if (contentType.includes('application/json')) {
      const body = await req.json();

      const result = await upsertProsaasLead(body);

      return NextResponse.json({
        ok: true,
        receivedAs: 'json',
        ...result,
      });
    }

    // -------- MULTIPART --------
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();

      const fields: Record<string, string> = {};
      const files: File[] = [];

      for (const [key, value] of formData.entries()) {
        if (typeof value === 'string') {
          fields[key] = value;
        } else {
          files.push(value);
        }
      }

      const metadata = fields.metadata
        ? JSON.parse(fields.metadata)
        : {};

      const result = await upsertProsaasLead(metadata);

      const savedFiles = await saveProsaasFilesToLead(
        result.leadId,
        files,
        metadata
      );

      return NextResponse.json({
        ok: true,
        receivedAs: 'multipart',
        ...result,
        filesCount: files.length,
        savedFilesCount: savedFiles.length,
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Unsupported content-type' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('PROSAAS WEBHOOK ERROR:', error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}