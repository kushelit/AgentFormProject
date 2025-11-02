import { db } from '@/lib/firebase/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import { makeCompanyCanonical } from '@/utils/reconcile';

export async function linkPolicyNumberToSale({
  saleId,
  agentId,
  customerId,
  company,
  policyNumber,
}: {
  saleId: string;
  agentId: string;
  customerId: string;
  company: string;
  policyNumber: string;
}) {
  const saleRef = doc(db, 'sales', saleId);
  const saleSnap = await getDoc(saleRef);
  if (!saleSnap.exists()) throw new Error('SALE לא נמצא');

  const policyNumberClean = String(policyNumber).trim();
  const policyNumberKey = policyNumberClean.replace(/\s+/g, '');
  const companyCanon = makeCompanyCanonical(company);

  await updateDoc(saleRef, {
    policyNumber: policyNumberClean,
    policyNumberKey,
    updatedAt: serverTimestamp(),
  });

  const idxId = `${agentId}_${companyCanon}_${policyNumberKey}`;
  await setDoc(
    doc(db, 'policyLinkIndex', idxId),
    {
      agentId,
      company: companyCanon,
      policyNumberKey,
      saleId,
      customerId,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function unlinkPolicyIndex({
  agentId,
  company,
  policyNumber,
}: {
  agentId: string;
  company: string;
  policyNumber: string;
}) {
  const policyNumberKey = String(policyNumber).trim().replace(/\s+/g, '');
  const companyCanon = makeCompanyCanonical(company);
  const idxId = `${agentId}_${companyCanon}_${policyNumberKey}`;

  // מוחקים את רשומת האינדקס (ניתן להחליף לאיפוס saleId אם מעדיפים לא למחוק)
  await deleteDoc(doc(db, 'policyLinkIndex', idxId));
}

// משאירים את createSaleAndLinkFromExternal כפי שיש אצלך – אין שינוי לוגי נדרש
export async function createSaleAndLinkFromExternal(args: any) {
  // ... המימוש הקיים שלך ...
  return Promise.resolve('new-sale-id');
}
