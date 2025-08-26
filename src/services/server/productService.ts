// src/services/server/productService.ts  ✅ SERVER ONLY
import { admin } from '@/lib/firebase/firebase-admin';
import type { Product } from '@/types/Product';

const COLLECTION = 'product'; // או 'products' אם זה השם האחיד אצלך

export async function getProductMap(): Promise<Record<string, Product>> {
  const db = admin.firestore();
  const snap = await db.collection(COLLECTION).get();

  const map: Record<string, Product> = {};
  snap.forEach(doc => {
    const data = doc.data() as any;
    const product: Product = {
      id: doc.id,
      productName: data.productName?.trim(),
      productGroup: data.productGroup || '',
      isOneTime: data.isOneTime || false,
    };
    if (product.productName) {
      map[product.productName] = product;
    }
  });

  return map;
}

// אליאס אם יש מקומות שמייבאים fetchProductMap
export const fetchProductMap = getProductMap;
