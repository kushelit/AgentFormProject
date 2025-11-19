// src/services/server/commissionService.ts
import { admin } from '@/lib/firebase/firebase-admin';
import type { ContractForCompareCommissions } from '@/types/Contract';
import type { CommissionSplit } from '@/types/CommissionSplit';
import type { Product } from '@/types/Product';

/* --------------------------------------------------
 🧮 Commission Splits (SERVER)
---------------------------------------------------*/
export async function fetchCommissionSplits(agentId: string): Promise<CommissionSplit[]> {
  const db = admin.firestore();
  const snap = await db.collection('commissionSplits').where('agentId', '==', agentId).get();
  return snap.docs.map(d => mapSplit(d.id, d.data()));
}

function mapSplit(id: string, data: any): CommissionSplit {
  return {
    id,
    agentId: data.agentId,
    sourceLeadId: data.sourceLeadId,
    percentToAgent: data.percentToAgent,
    percentToSourceLead: data.percentToSourceLead,
    splitMode: (data.splitMode as 'commission' | 'production') ?? 'commission',
  };
}

/* --------------------------------------------------
 📦 Products Map (SERVER)
---------------------------------------------------*/
export async function fetchProductMap(): Promise<Record<string, Product>> {
  const db = admin.firestore();
  const snap = await db.collection('products').get();

  const map: Record<string, Product> = {};
  snap.forEach(doc => {
    const data = doc.data() as any;
    const name = data.productName?.trim();
    if (name) {
      map[name] = {
        id: doc.id,
        productName: name,
        productGroup: data.productGroup || '',
        isOneTime: data.isOneTime || false,
      };
    }
  });

  return map;
}

/* --------------------------------------------------
 🧰 Contracts + Products (SERVER)
---------------------------------------------------*/
export async function fetchContractsAndProducts(): Promise<{
  contracts: ContractForCompareCommissions[];
  productMap: Record<string, Product>;
}> {
  const db = admin.firestore();
  const contractsSnap = await db.collection('contracts').get();
  const productsSnap = await db.collection('products').get();

  const contracts: ContractForCompareCommissions[] = contractsSnap.docs.map(doc => {
    const data = doc.data() as any;
    return {
      id: doc.id,
      company: data.company,
      product: data.product,
      productsGroup: data.productsGroup,
      AgentId: data.AgentId,
      commissionNifraim: data.commissionNifraim,
      commissionHekef: data.commissionHekef,
      commissionNiud: data.commissionNiud,
      minuySochen: data.minuySochen,
    };
  });

  const productMap: Record<string, Product> = {};
  productsSnap.forEach(doc => {
    const data = doc.data() as any;
    const name = data.productName?.trim();
    if (name) {
      productMap[name] = {
        id: doc.id,
        productName: name,
        productGroup: data.productGroup || '',
        isOneTime: data.isOneTime || false,
      };
    }
  });

  return { contracts, productMap };
}

/* --------------------------------------------------
 🔁 Alias for backwards-compat (if your generators import getProductMap)
---------------------------------------------------*/
export const getProductMap = fetchProductMap;
