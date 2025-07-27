// services/productService.ts
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { Product } from '@/types/Product';

export async function getProductMap(): Promise<Record<string, Product>> {
  const snapshot = await getDocs(collection(db, 'product'));

  const map: Record<string, Product> = {};

  snapshot.forEach((doc) => {
    const data = doc.data();
    const product: Product = {
      id: doc.id,
      productName: data.productName,     
      productGroup: data.productGroup || '',
      isOneTime: data.isOneTime || false,
    };

    map[product.productName] = product;
  });

  return map;
}
