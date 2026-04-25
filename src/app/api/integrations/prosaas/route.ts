export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

const DEFAULT_STATUS_LEAD = 'JVhM7nnBrwNBfvrb4zH5';
const PROSAAS_SOURCE_VALUE = 'prosaaslead';

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

function normalizeBucketName(b: string) {
  const s = String(b || "").trim().replace(/^gs:\/\//, "");
  if (!s) return "";
  if (s.endsWith(".firebasestorage.app")) {
    return s.replace(".firebasestorage.app", ".appspot.com");
  }
  return s;
}

const compactUpdate = (obj: Record<string, any>) => {
  const out: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  }

  return out;
};

function mapProsaasToLead(payload: any) {
  const contact = payload?.contact || {};
  const fallbackName = splitName(contact.name || payload.full_name || payload.lead_name);

  const customFields = payload?.custom_fields || {};

  const firstNameCustomer =
    clean(contact.first_name) ||
    clean(payload.first_name) ||
    fallbackName.firstNameCustomer;

  const lastNameCustomer =
    clean(contact.last_name) ||
    clean(payload.last_name) ||
    fallbackName.lastNameCustomer;

  return {
    sourceValue: PROSAAS_SOURCE_VALUE,

    firstNameCustomer,
    lastNameCustomer,
    phone: clean(contact.phone || payload.phone || payload.lead_phone),
    mail: clean(contact.email || payload.email || payload.mail),

    IDCustomer: clean(
      payload.id_number ||
        payload.IDCustomer ||
        customFields.id_number ||
        customFields.IDCustomer
    ),

    birthday: clean(
      payload.birth_date ||
        payload.birthday ||
        customFields.birth_date ||
        customFields.birthday
    ),

    gender: clean(contact.gender || payload.gender || customFields.gender),
    city: clean(contact.city || payload.city || customFields.city),
    notes: clean(payload.notes || payload.description),

    externalSystem: 'prosaas',
    externalBusinessId: clean(payload.business_id),
    externalLeadId: clean(payload.lead_id),
    externalStatus: clean(payload.status),
    externalOldStatus: clean(payload.old_status),
    externalEvent: clean(payload.event),
    externalRawPayload: payload,
  };
}

async function getAgentIdFromSourceValue(db: FirebaseFirestore.Firestore) {
  const sourceDoc = await db.collection('sourceLead').doc(PROSAAS_SOURCE_VALUE).get();

  if (!sourceDoc.exists) {
    throw new Error(`sourceLead not found for PROSAAS_SOURCE_VALUE: ${PROSAAS_SOURCE_VALUE}`);
  }

  const data = sourceDoc.data() as any;
  const agentId = data?.AgentId || data?.agentId;

  if (!agentId) {
    throw new Error(`Missing AgentId on sourceLead/${PROSAAS_SOURCE_VALUE}`);
  }

  return agentId;
}

async function upsertProsaasLead(payload: any) {
  const db = admin.firestore();

  const leadData = mapProsaasToLead(payload);

  if (!leadData.externalBusinessId || !leadData.externalLeadId) {
    throw new Error('Missing business_id or lead_id');
  }

  if (!leadData.phone) {
    throw new Error('Missing phone');
  }

  const existingSnap = await db
    .collection('leads')
    .where('externalSystem', '==', 'prosaas')
    .where('externalBusinessId', '==', leadData.externalBusinessId)
    .where('externalLeadId', '==', leadData.externalLeadId)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const leadRef = existingSnap.docs[0].ref;

    await leadRef.set(
      {
        ...compactUpdate(leadData),
        lastUpdateDate: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      action: 'updated',
      leadId: leadRef.id,
    };
  }

  const agentId = await getAgentIdFromSourceValue(db);

  const newLeadRef = await db.collection('leads').add({
    ...leadData,
    AgentId: agentId,
    consentForInformationRequest: false,
    createDate: admin.firestore.FieldValue.serverTimestamp(),
    lastUpdateDate: admin.firestore.FieldValue.serverTimestamp(),
    selectedStatusLead: DEFAULT_STATUS_LEAD,
  });

  return {
    action: 'created',
    leadId: newLeadRef.id,
  };
}


async function saveProsaasFilesToLead(
  leadId: string,
  files: File[],
  metadata: any
) {
  if (!files.length) return [];

  const db = admin.firestore();
const bucketNameRaw =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  '';

const bucketName = normalizeBucketName(bucketNameRaw);

if (!bucketName) {
  throw new Error('Missing Firebase storage bucket env');
}

const bucket = admin.storage().bucket(bucketName);

  const savedFiles = [];

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeFileName = file.name.replace(/[^\w.\-א-ת ]/g, '_');
    const storagePath = `leadFiles/prosaas/${leadId}/${Date.now()}-${safeFileName}`;

    const storageFile = bucket.file(storagePath);

    await storageFile.save(buffer, {
      metadata: {
        contentType: file.type || 'application/octet-stream',
      },
    });

    const docRef = await db.collection('leadDocuments').add({
      leadId,
      sourceSystem: 'prosaas',
      externalBusinessId: String(metadata.business_id || ''),
      externalLeadId: String(metadata.lead_id || ''),
      fileName: file.name,
      mimeType: file.type || '',
      size: file.size || 0,
      storagePath,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    savedFiles.push({
      documentId: docRef.id,
      fileName: file.name,
      storagePath,
    });
  }

  return savedFiles;
}

export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get('x-api-key');
    const expectedKey = process.env.PROSAAS_WEBHOOK_SECRET;

    if (!expectedKey) {
      console.error('Missing PROSAAS_WEBHOOK_SECRET in env');
      return NextResponse.json(
        { ok: false, error: 'Server misconfigured' },
        { status: 500 }
      );
    }

    if (apiKey !== expectedKey) {
      console.warn('Unauthorized webhook attempt');
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const contentType = req.headers.get('content-type') || '';

    console.log('=== PROSAAS WEBHOOK START ===');
    console.log('RAW content-type:', contentType);

    if (contentType.includes('application/json')) {
      const body = await req.json();
      console.log('JSON BODY:', body);

      const result = await upsertProsaasLead(body);

      return NextResponse.json({
        ok: true,
        receivedAs: 'json',
        ...result,
      });
    }

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();

      const fields: Record<string, string> = {};
    const files: File[] = [];
const filesLog: Array<{
  fieldName: string;
  fileName: string;
  mimeType: string;
  size: number;
}> = [];

  for (const [key, value] of formData.entries()) {
  if (typeof value === 'string') {
    fields[key] = value;
  } else {
    files.push(value);

    filesLog.push({
      fieldName: key,
      fileName: value.name || '',
      mimeType: value.type || '',
      size: value.size || 0,
    });
  }
}

      console.log('FORM FIELDS:', fields);
      console.log('FILES:', files);

      const metadata = fields.metadata ? JSON.parse(fields.metadata) : {};
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
  fieldsCount: Object.keys(fields).length,
  filesCount: files.length,
  savedFilesCount: savedFiles.length,
});
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'Unsupported content-type',
        contentType,
      },
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