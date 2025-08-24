// services/reconcileLinks.ts
'use client';

import { db } from '@/lib/firebase/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ym } from '@/utils/reconcile';

/**
 * helper ליצירת מפתח האינדקס הקבוע לשיוך לפי מספר פוליסה
 * policyLinkIndex documentId = `${agentId}::${company}::${policyNumber}`
 */
const policyKey = (agentId: string, company?: string, policyNumber?: string) =>
  `${agentId}::${company || ''}::${policyNumber || ''}`;

/** 🔎 כמו שהיה – אין שינוי (השאירי את המימוש שלך אם קיים) */
export async function fetchDrillForKey(/* ... */) {
  /* כפי שהיה */
}

/**
 * ✅ קישור EXTERNAL -> SALE
 * - מעדכן externalCommissions.{extId} בשדות: linkedSaleId, linkedAt, linkSource, policyMonth (+reportMonth אם קיים)
 * - צורב לוג ב-commissionLinks (מפתח = extId)
 * - מעדכן sales.{saleId}: linkedExternalId, ואם policyNumber חסר – משלים מהקובץ/פרמטר
 * - יוצר/מעדכן policyLinkIndex[agentId::company::policyNumber] = { saleId }
 *
 * Idempotent: אם כבר משויך לאותו saleId, נעשה רק merge ועדכוני מטא-דאטה.
 */
export async function linkExternalToSale(meta: {
  extId: string;
  saleId: string;
  agentId: string;
  customerId: string;
  company: string;
  policyMonth: string; // YYYY-MM
  reportMonth?: string; // YYYY-MM (לא חובה, נשמר ללוג/trace)
  policyNumber?: string; // לשיוך קבוע (מומלץ מאוד)
  linkSource?: 'manual' | 'index' | 'fallback';
}) {
  const {
    extId,
    saleId,
    agentId,
    customerId,
    company,
    policyMonth,
    reportMonth,
    policyNumber: pnFromParam,
    linkSource = 'manual',
  } = meta;

  // נביא את ה-external כדי לשאוב policyNumber אם לא סופק
  const extRef = doc(db, 'externalCommissions', extId);
  const extSnap = await getDoc(extRef);
  if (!extSnap.exists()) throw new Error('external row not found');
  const ext = extSnap.data() as any;

  // policyNumber עדיפות: פרמטר -> external -> (לבסוף sale בהמשך אם נדרש)
  const finalPolicyNumber = String(pnFromParam || ext?.policyNumber || '').trim() || undefined;

  // 1) לוג קישור מרכזי (1:1 מול external) — commissionLinks/{extId}
  await setDoc(
    doc(db, 'commissionLinks', extId),
    {
      extId,
      saleId,
      agentId,
      customerId,
      company,
      policyMonth,
      ...(reportMonth ? { reportMonth } : {}),
      policyNumber: finalPolicyNumber || null,
      linkSource,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 2) עדכון ה-external שיראה שהוא מקושר
  const externalUpdate: Record<string, any> = {
    linkedSaleId: saleId,
    linkedAt: serverTimestamp(),
    linkSource,
    policyMonth,
  };
  if (reportMonth) externalUpdate.reportMonth = reportMonth;

  await updateDoc(extRef, externalUpdate);

  // 3) עדכון ה-SALE: נצרוב את ה-extId, ואם חסר policyNumber – נשלים
  const saleRef = doc(db, 'sales', saleId);
  const saleSnap = await getDoc(saleRef);
  if (saleSnap.exists()) {
    const sale = saleSnap.data() as any;
    const updates: Record<string, any> = { linkedExternalId: extId };

    // נשלים policyNumber רק אם חסר/ריק
    const salePolicy = (sale.policyNumber ?? '').toString().trim();
    if (!salePolicy && finalPolicyNumber) {
      updates.policyNumber = finalPolicyNumber;
    }

    await updateDoc(saleRef, updates);
  }

  // 4) אינדקס לפוליסה – אם יש policyNumber סופי, נשמור שיוך קבוע
  if (finalPolicyNumber) {
    const idxRef = doc(db, 'policyLinkIndex', policyKey(agentId, company, finalPolicyNumber));
    await setDoc(idxRef, { saleId, updatedAt: serverTimestamp() }, { merge: true });
  }
}

/**
 * ✅ ניתוק שיוך:
 * - מוחק commissionLinks/{extId}
 * - מנקה externalCommissions.{extId}.linkedSaleId
 * - מנקה sales.{saleId}.linkedExternalId (אם מצביע על extId הזה)
 * - מנסה לנקות policyLinkIndex אם קיים ורלוונטי (אותו saleId)
 */
export async function unlinkExternalLink(extId: string) {
  // נאתר את ה-saleId מ-doc הקישור
  const linkRef = doc(db, 'commissionLinks', extId);
  const linkSnap = await getDoc(linkRef);
  const link = linkSnap.exists() ? (linkSnap.data() as any) : null;
  const saleId = link?.saleId || null;

  // נביא גם את ה-external כדי להשיג agentId/company/policyNumber לצורך ניקוי האינדקס
  const extRef = doc(db, 'externalCommissions', extId);
  const extSnap = await getDoc(extRef);
  const ext = extSnap.exists() ? (extSnap.data() as any) : null;

  // 1) מחיקת הקישור המרכזי (לוג)
  if (linkSnap.exists()) {
    await deleteDoc(linkRef);
  }

  // 2) ניקוי דגל ב-external
  if (extSnap.exists()) {
    await setDoc(
      extRef,
      { linkedSaleId: null, linkSource: null, linkedAt: null }, // אופציונלי לאפס מטאדאטה
      { merge: true }
    );
  }

  // 3) ניקוי דגל ב-sale (רק אם קיים ומתאים extId הזה)
  if (saleId) {
    const saleRef = doc(db, 'sales', saleId);
    const saleSnap = await getDoc(saleRef);
    if (saleSnap.exists()) {
      const sale = saleSnap.data() as any;
      if (sale.linkedExternalId === extId) {
        await setDoc(saleRef, { linkedExternalId: null }, { merge: true });
      }
    }
  }

  // 4) ניקוי policyLinkIndex (זהירות: רק אם האינדקס מצביע לאותו saleId כדי לא להרוס שיוך אחר)
  const agentId = ext?.agentId ? String(ext.agentId) : null;
  const company = ext?.company ? String(ext.company) : null;
  const policyNumber = ext?.policyNumber ? String(ext.policyNumber) : null;

  if (agentId && company && policyNumber) {
    const idxRef = doc(db, 'policyLinkIndex', policyKey(agentId, company, policyNumber));
    const idxSnap = await getDoc(idxRef);
    if (idxSnap.exists()) {
      const idxData = idxSnap.data() as { saleId?: string };
      if (!idxData.saleId || (saleId && idxData.saleId === saleId)) {
        // אם מצביע לאותו saleId (או חסר), נוכל למחוק כדי למנוע שיוך עתידי אוטומטי שגוי
        await deleteDoc(idxRef);
      }
    }
  }
}
