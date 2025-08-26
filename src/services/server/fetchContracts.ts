// src/services/server/fetchContracts.ts  ✅ SERVER ONLY
import { admin } from '@/lib/firebase/firebase-admin';
import type { ContractForCompareCommissions } from '@/types/Contract';

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

export const fetchContracts = async (): Promise<ContractForCompareCommissions[]> => {
  const db = admin.firestore();
  const snap = await db.collection('contracts').get();
  return snap.docs.map(d => mapContract(d.id, d.data()));
};

export const fetchContractsByAgent = async (
  agentId: string
): Promise<ContractForCompareCommissions[]> => {
  const db = admin.firestore();
  const snap = await db.collection('contracts').where('AgentId', '==', agentId).get();
  return snap.docs.map(d => mapContract(d.id, d.data()));
};
