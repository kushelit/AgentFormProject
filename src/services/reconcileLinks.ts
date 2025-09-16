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

/* ───────── name helpers (from Excel importer logic) ───────── */
type NameOrder = 'firstNameFirst' | 'lastNameFirst';

/** מפצל fullName לשם פרטי/משפחה */
function splitFullName(fullNameRaw: string, structure: NameOrder = 'firstNameFirst') {
  const parts = String(fullNameRaw || '').trim().split(' ').filter(Boolean);
  let firstName = '';
  let lastName = '';

  if (parts.length === 1) {
    firstName = parts[0];
  } else if (parts.length === 2) {
    if (structure === 'firstNameFirst') {
      firstName = parts[0];
      lastName = parts[1];
    } else {
      firstName = parts[1];
      lastName = parts[0];
    }
  } else if (parts.length === 3) {
    if (structure === 'firstNameFirst') {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    } else {
      firstName = parts.slice(2).join(' ');
      lastName = parts.slice(0, 2).join(' ');
    }
  } else {
    // 4 מילים ומעלה
    if (structure === 'firstNameFirst') {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    } else {
      firstName = parts.slice(-1).join(' ');
      lastName = parts.slice(0, -1).join(' ');
    }
  }
  return { firstName, lastName };
}

/* ───────── try get fullName from policyCommissionSummaries ───────── */
async function fetchFullNameFromPolicySummaries(agentId: string, customerId: string): Promise<string | null> {
  const qy = query(
    collection(db, 'policyCommissionSummaries'),
    where('agentId', '==', String(agentId)),
    where('customerId', '==', String(customerId))
  );
  const snap = await getDocs(qy);
  for (const d of snap.docs) {
    const x = d.data() as any;
    const nm = x?.fullName || x?.customerName;
    if (nm && String(nm).trim()) return String(nm).trim();
  }
  return null;
}

/* ───────── customer ensure ───────── */
/** מאשר שקיים לקוח (AgentId + IDCustomer). אם אין — מקים מינימלי ומחזיר מזהה. */
async function ensureCustomer(params: {
  agentId: string;
  IDCustomer: string;
  /** אם לא נשלח — ננסה להביא מ-policyCommissionSummaries ולפצל */
  firstNameCustomer?: string;
  lastNameCustomer?: string;
  /** אם השמות באים כ-fullName, באיזה סדר? (ברירת מחדל: שם פרטי קודם) */
  nameOrder?: NameOrder;
}) {
  const {
    agentId,
    IDCustomer,
    firstNameCustomer = '',
    lastNameCustomer = '',
    nameOrder = 'firstNameFirst',
  } = params;

  // כבר קיים?
  const qCust = query(
    collection(db, 'customer'),
    where('AgentId', '==', String(agentId)),
    where('IDCustomer', '==', String(IDCustomer))
  );
  const snap = await getDocs(qCust);
  if (!snap.empty) return snap.docs[0].id;

  // אין שם מפורק? ננסה למשוך fullName מסיכומי הפוליסות ולפצל
  let f = firstNameCustomer;
  let l = lastNameCustomer;
  if (!f && !l) {
    const full = await fetchFullNameFromPolicySummaries(agentId, IDCustomer);
    if (full) {
      const split = splitFullName(full, nameOrder);
      f = split.firstName;
      l = split.lastName;
    }
  }

  const ref = await addDoc(collection(db, 'customer'), {
    AgentId: String(agentId),
    firstNameCustomer: f || '',
    lastNameCustomer: l || '',
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

/* ───────── Template-aware product & premium mapping ───────── */

type TemplateConfig = {
  lineOfBusiness?: 'insurance' | 'pensia' | 'finansim' | 'mix';
  defaultPremiumField?: 'insPremia' | 'pensiaPremia' | 'finansimPremia' | 'finansimZvira'| string;
  fallbackProduct?: string;
  productMap?: Record<
    string,
    {
      canonicalProduct: string;
      aliases?: string[];
      premiumField?: 'insPremia' | 'pensiaPremia' | 'finansimPremia' | 'finansimZvira'| string; // אופציונלי לכל כלל
    }
  >;
};

const normalizeLoose = (s: any) =>
  String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[\s\-_/.,'"`]+/g, ' ');

async function readTemplateConfig(templateId?: string | null): Promise<TemplateConfig | null> {
  if (!templateId) return null;
  try {
    const ref = doc(db, 'commissionTemplates', String(templateId));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const d = snap.data() as any;
    return {
      lineOfBusiness: d.lineOfBusiness || undefined,
      defaultPremiumField: d.defaultPremiumField || undefined,
      fallbackProduct: d.fallbackProduct || undefined,
      productMap: d.productMap || undefined,
    };
  } catch {
    return null;
  }
}

function resolveProductRule(rawProduct: string, template: TemplateConfig | null) {
  const rp = normalizeLoose(rawProduct);
  if (!template?.productMap) return null;

  for (const key of Object.keys(template.productMap)) {
    const rule = template.productMap[key];
    const aliases: string[] = (rule.aliases || []).map(normalizeLoose);
    if (aliases.some((a) => a && (rp === a || rp.includes(a) || a.includes(rp)))) {
      return rule;
    }
  }
  return null;
}

function computeSaleMapping(opts: {
  rawProduct: string;
  template: TemplateConfig | null;
}): { product: string; premiumField?: string } {
  const { rawProduct, template } = opts;
  const rule = resolveProductRule(rawProduct, template);

  // קביעת מוצר קנוני
  const product = rule?.canonicalProduct || template?.fallbackProduct || '';

  // קביעת שדה פרמיה
  let premiumField = rule?.premiumField || template?.defaultPremiumField;
  if (!premiumField && template?.lineOfBusiness) {
    premiumField =
      template.lineOfBusiness === 'insurance'
        ? 'insPremia'
        : template.lineOfBusiness === 'finansim'
        ? 'finansimPremia'
        : template.lineOfBusiness === 'pensia'
        ? 'pensiaPremia'
        : undefined; // mix בלי ברירת-מחדל – יישאר undefined אם לא צוין
  }
  return { product, premiumField };
}

/* ───────── יצירה: “צור SALE וקשר” ───────── */
/**
 * יוצר SALE חדש מתוך נתוני טעינה ומקשר באינדקס לפי policyNumber.
 * דואג להקים לקוח אם חסר, ומנסה להביא fullName מה־policyCommissionSummaries ולפצל לשם פרטי/משפחה.
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
    // אופציונלי — אם ידועות
    firstNameCustomer?: string;
    lastNameCustomer?: string;
    /** סדר השם במקרה של fullName שמגיע מבחוץ; ברירת מחדל: 'firstNameFirst' */
    nameOrder?: NameOrder;
    /** חדש: מזהה תבנית כדי לקבוע product/שדה פרמיה */
    templateId?: string | null;
    /** חדש: סכום פרמיה מצטבר לפוליסה */
    totalPremiumAmount?: number | null;
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
    nameOrder = 'firstNameFirst',
    templateId = null,
    totalPremiumAmount = null,
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

  // ודא/הקם לקוח (כולל ניסיון למשוך fullName ולפצל אם לא סופק)
  await ensureCustomer({
    agentId,
    IDCustomer: customerId,
    firstNameCustomer,
    lastNameCustomer,
    nameOrder,
  });

  // month/mounth: היום הראשון בחודש ה-VALID; אם אין – לפי reportYm; אחרת ריק
  const saleStart = ymToStartDate(validMonth) || ymToStartDate(reportYm) || '';

  // ---- תבנית: קביעת product & premiumField ----
  const template = await readTemplateConfig(templateId || undefined);
  const { product: productFromTpl, premiumField } = computeSaleMapping({
    rawProduct: String(product || ''),
    template,
  });

  // product: אם יש קטלוג ל-SALE – ננסה התאמה גם אליו; אחרת נשתמש בתוצאה מהתבנית/מקור
  const resolvedByCatalog = resolveProductForSale(productFromTpl || String(product || ''), catalogProducts);
  const finalProduct = resolvedByCatalog || productFromTpl || '';

  // יצירת SALE
  const saleDoc: any = {
    AgentId: String(agentId),
    IDCustomer: String(customerId),
    company: String(company || ''),
    product: finalProduct || '',                 // יכול להיות '' אם לא זוהה
    productExternal: (product || '').trim() || null,
    month: saleStart,                            // חלק מהמסכים עובדים עם "month"
    mounth: saleStart,                           // אצלכם ב-DB
    policyNumber: String(policyNumber || ''),
    statusPolicy: 'פעילה',
    createdAt: serverTimestamp(),
    lastUpdateDate: serverTimestamp(),
    sourceApp: 'reconcile',
  };

  // שמירת totalPremiumAmount גם כשדה גנרי וגם בשדה הספציפי אם ידוע
  if (typeof totalPremiumAmount === 'number' && !isNaN(totalPremiumAmount)) {
    saleDoc.totalPremiumAmount = totalPremiumAmount;
    if (premiumField) {
      saleDoc[premiumField] = totalPremiumAmount;
    }
  }

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
