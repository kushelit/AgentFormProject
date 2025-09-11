// services/salesFromExternal.ts
'use client';

import { db } from '@/lib/firebase/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

/** יצירת SALE בסיסי מתוך רשומת טעינה */
export async function createSaleFromExternal(input: {
  AgentId: string;
  IDCustomer: string;
  company: string;
  product?: string | null;
  policyNumber?: string | null;
  policyMonth?: string | null; // YYYY-MM
}) {
  const {
    AgentId,
    IDCustomer,
    company,
    product = '',
    policyNumber = '',
    policyMonth = '',
  } = input;

  const docRef = await addDoc(collection(db, 'sales'), {
    AgentId,
    IDCustomer,
    company,
    product,
    policyNumber,
    month: policyMonth || null,
    statusPolicy: 'פעילה',
    createdAt: serverTimestamp(),
    createdFrom: 'external-linker',
  });

  return docRef.id;
}
