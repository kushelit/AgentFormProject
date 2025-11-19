// src/services/commissionService.ts

import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { ContractForCompareCommissions } from '@/types/Contract';
import type { CommissionSplit } from '@/types/CommissionSplit';
import type { Product } from '@/types/Product';

/* --------------------------------------------------
 🧮 Commission Splits
---------------------------------------------------*/

export async function fetchCommissionSplits(agentId: string): Promise<CommissionSplit[]> {
  const q = query(
    collection(db, 'commissionSplits'),
    where('agentId', '==', agentId)
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => mapSplit(doc.id, doc.data()));
}

function mapSplit(id: string, data: any): CommissionSplit {
  return {
    id,
    agentId: data.agentId,
    sourceLeadId: data.sourceLeadId,
    percentToAgent: data.percentToAgent,
    percentToSourceLead: data.percentToSourceLead,
    // ברירת מחדל כדי ש-TypeScript יהיה מרוצה גם אם השדה לא קיים במסד
    splitMode: (data.splitMode as 'commission' | 'production') ?? 'commission',
  };
}

/* --------------------------------------------------
 📦 Products Map
---------------------------------------------------*/

export async function fetchProductMap(): Promise<Record<string, Product>> {
  const productsSnapshot = await getDocs(collection(db, 'products'));

  const map: Record<string, Product> = {};

  productsSnapshot.forEach((doc) => {
    const data = doc.data();
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

/**
 * שולף את כל החוזים ואת מפת המוצרים (לפי productName)
 */
export async function fetchContractsAndProducts(): Promise<{
  contracts: ContractForCompareCommissions[];
  productMap: Record<string, Product>;
}> {
  const contractsSnapshot = await getDocs(collection(db, 'contracts'));
  const productsSnapshot = await getDocs(collection(db, 'products'));

  const contracts: ContractForCompareCommissions[] = contractsSnapshot.docs.map(doc => ({
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

  const productMap: Record<string, Product> = {};
  productsSnapshot.forEach(doc => {
    const data = doc.data();
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
