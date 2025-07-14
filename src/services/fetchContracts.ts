// src/services/fetchContracts.ts

import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { ContractForCompareCommissions } from '@/types/Contract'; // ודאי שיש לך טיפוס כזה

export const fetchContracts = async (): Promise<ContractForCompareCommissions[]> => {
  const snapshot = await getDocs(collection(db, 'contracts'));

  const contracts: ContractForCompareCommissions[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    company: doc.data().company,
    product: doc.data().product,
    productsGroup: doc.data().productsGroup,
    AgentId: doc.data().AgentId,
    commissionNifraim: doc.data().commissionNifraim,
    commissionHekef: doc.data().commissionHekef,
    commissionNiud: doc.data().commissionNiud,
    minuySochen: doc.data().minuySochen,
  }));

  return contracts;
};

export default fetchContracts;
