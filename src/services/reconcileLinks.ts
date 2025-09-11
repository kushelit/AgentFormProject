// services/reconcileLinks.ts
'use client';

import { db } from '@/lib/firebase/firebase';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import { makeCompanyCanonical } from '@/utils/reconcile';

/* ───────── utils ───────── */
const normalizePolicyKey = (v: any) => String(v ?? '').trim().replace(/\s+/g, '');
const policyIndexKey = (agentId: string, companyCanon: string, policyNumberKey: string) =>
  `${agentId}::${companyCanon}::${policyNumberKey}`;

/** YYYY-MM → YYYY-MM-01 ; אחרת מחזיר '' */
function ymToStartDate(ym?: string | null): string {
  const s = String(ym || '').trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : '';
}

/** ניסיון עדין להתאים מוצר חיצוני לקטלוג ה-SALE. אם לא מצליחים → '' ושומרים את המקור ב-productExternal */
function resolveProductForSale(externalProduct?: string | null, catalogKeys: string[] = []): string {
  const raw = String(externalProduct || '').trim();
  if (!raw) return '';
  const norm = (x: string) => x.toLowerCase().replace(/[\s\-_/.,'"`]+/g, '');

  // 1) התאמה מדויקת
  if (catalogKeys.includes(raw)) return raw;

  // 2) התאמה לפי נרמול
  const target = norm(raw);
  const byNorm = catalogKeys.find((k) => norm(k) === target);
  if (byNorm) return byNorm;

  // 3) התאמה חלקית זהירה
  const partial = catalogKeys.find((k) => norm(k).includes(target) || target.includes(norm(k)));
  return partial || '';
}

/* ───────── customer ensure ───────── */
/** מאשר שקיים לקוח (AgentId + IDCustomer). אם אין — מקים מינימלי ומחזיר מזהה. */
async function ensureCustomer(params: {
  agentId: string;
  IDCustomer: string;
  firstNameCustomer?: string;
  lastNameCustomer?: string;
}) {
  const { agentId, IDCustomer, firstNameCustomer = '', lastNameCustomer = '' } = params;

  const qCust = query(
    collection(db, 'customer'),
    where('AgentId', '==', String(agentId)),
    where('IDCustomer', '==', String(IDCustomer))
  );
  const snap = await getDocs(qCust);
  if (!snap.empty) return snap.docs[0].id;

  const ref = await addDoc(collection(db, 'customer'), {
    AgentId: String(agentId),
    firstNameCustomer,
    lastNameCustomer,
    IDCustomer: String(IDCustomer),
    parentID: '',
    sourceApp: 'reconcile',
    createdAt: serverTimestamp(),
  });
  await updateDoc(ref, { parentID: ref.id });
  return ref.id;
}

/* ───────── אינדקס קבוע: policyNumber → SALE ───────── */
export async function linkPolicyNumberToSale(params: {
  saleId: string;
  agentId: string;
  customerId: string;
  company: string;          // raw
  policyNumber: string;     // חובה
}) {
  const { saleId, agentId, customerId, company, policyNumber } = params;
  const companyCanon = makeCompanyCanonical(company);
  const key = normalizePolicyKey(policyNumber);
  if (!key) throw new Error('policyNumber is required');

  await setDoc(
    doc(db, 'policyLinkIndex', policyIndexKey(agentId, companyCanon, key)),
    {
      agentId,
      company: companyCanon,
      policyNumberKey: key,
      saleId,
      customerId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // אם ל-SALE אין עדיין policyNumber – נשלים אותו
  const saleRef = doc(db, 'sales', saleId);
  const saleSnap = await getDoc(saleRef);
  if (saleSnap.exists()) {
    const cur = String((saleSnap.data() as any).policyNumber || '').trim();
    if (!cur) {
      await updateDoc(saleRef, { policyNumber });
    }
  }
}

/** ביטול שיוך באינדקס (לא נוגעים ב-external) */
export async function unlinkPolicyIndex(params: {
  agentId: string;
  company: string;      // raw
  policyNumber: string;
}) {
  const { agentId, company, policyNumber } = params;
  const companyCanon = makeCompanyCanonical(company);
  const key = normalizePolicyKey(policyNumber);
  if (!key) return;

  const idxRef = doc(db, 'policyLinkIndex', policyIndexKey(agentId, companyCanon, key));
  const snap = await getDoc(idxRef);
  if (snap.exists()) {
    await deleteDoc(idxRef);
  }
}

/* ───────── יצירה: “צור SALE וקשר” ───────── */
/**
 * יוצר SALE חדש מתוך נתוני טעינה ומקשר באינדקס לפי policyNumber.
 * לא כותב ולא משנה כלום ב-externalCommissions / policyCommissionSummaries.
 */
export async function createSaleAndLinkFromExternal(meta: {
  external: {
    agentId: string;
    customerId: string;             // ת"ז
    company: string;                // raw
    product?: string | null;
    policyNumber: string;           // חובה
    validMonth?: string | null;     // YYYY-MM
    // אופציונלי בלבד — אם ידוע לך השם: יישמרו ב-customer אם נדרש להקים
    firstNameCustomer?: string;
    lastNameCustomer?: string;
  };
  reportYm?: string;                // YYYY-MM – fallback אם אין validMonth
  catalogProducts?: string[];       // אופציונלי: מפתחות מוצר לקטלוג SALE
}) {
  const { external, reportYm, catalogProducts = [] } = meta;
  const {
    agentId,
    customerId,
    company,
    product,
    policyNumber,
    validMonth,
    firstNameCustomer = '',
    lastNameCustomer = '',
  } = external;

  if (!agentId || !customerId || !company || !policyNumber) {
    throw new Error('חסר מידע: agentId / customerId / company / policyNumber');
  }

  const companyCanon = makeCompanyCanonical(company);
  const policyKey = normalizePolicyKey(policyNumber);
  if (!policyKey) throw new Error('policyNumber is invalid');

  // מניעת כפילות: אם כבר קיים אינדקס שמצביע ל-SALE – לא נקים עוד אחד
  const idxRef = doc(db, 'policyLinkIndex', policyIndexKey(agentId, companyCanon, policyKey));
  const idxSnap = await getDoc(idxRef);
  if (idxSnap.exists() && (idxSnap.data() as any)?.saleId) {
    throw new Error('הפוליסה כבר מקושרת ל-SALE אחר');
  }

  // ודא/הקם לקוח
  await ensureCustomer({
    agentId,
    IDCustomer: customerId,
    firstNameCustomer,
    lastNameCustomer,
  });

  // month/mounth: היום הראשון בחודש ה-VALID; אם אין – לפי reportYm; אחרת ריק
  const saleStart = ymToStartDate(validMonth) || ymToStartDate(reportYm) || '';

  // product: ניסיון התאמה; אם לא הצליח – נשמור ריק ונשמר מקור בשדה productExternal
  const resolvedProduct = resolveProductForSale(product, catalogProducts);

  // יצירת SALE
  const saleDoc = {
    AgentId: String(agentId),
    IDCustomer: String(customerId),
    company: String(company || ''),
    product: resolvedProduct,                    // יכול להיות '' אם לא זוהה
    productExternal: (product || '').trim() || null,
    month: saleStart,                            // חלק מהמסכים עובדים עם "month"
    mounth: saleStart,                           // אצלכם ב-DB
    policyNumber: String(policyNumber || ''),
    statusPolicy: 'פעילה',
    createdAt: serverTimestamp(),
    lastUpdateDate: serverTimestamp(),
    sourceApp: 'reconcile',
  };

  const saleRef = await addDoc(collection(db, 'sales'), saleDoc);

  // קישור באינדקס – הדבר המכריע לעתיד
  await setDoc(
    idxRef,
    {
      agentId,
      company: companyCanon,
      policyNumberKey: policyKey,
      saleId: saleRef.id,
      customerId: String(customerId),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return saleRef.id;
}
