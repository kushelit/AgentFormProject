// src/services/fetchContracts.ts

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { ContractForCompareCommissions } from '@/types/Contract'; // או Contract אם את רוצה לשנות את השם הכללי

// שליפה של כל החוזים
export const fetchContracts = async (): Promise<ContractForCompareCommissions[]> => {
  const snapshot = await getDocs(collection(db, 'contracts'));

  return snapshot.docs.map(doc => mapContract(doc.id, doc.data()));
};

// שליפה לפי סוכן
export const fetchContractsByAgent = async (agentId: string): Promise<ContractForCompareCommissions[]> => {
  const q = query(collection(db, 'contracts'), where('AgentId', '==', agentId));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => mapContract(doc.id, doc.data()));
};

// פונקציית עזר למיפוי
function mapContract(id: string, data: any): ContractForCompareCommissions {
  return {
    id,
    company: data.company,
    product: data.product,
    productsGroup: data.productsGroup,
    AgentId: data.AgentId,
    commissionNifraim: data.commissionNifraim,
    commissionHekef: data.commissionHekef,
    commissionNiud: data.commissionNiud,
    minuySochen: data.minuySochen,
  };
}

export default fetchContracts;


