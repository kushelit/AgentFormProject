'use client';
// src/components/commission/summary/ClassifiedProduct.tsx
// המוצר המסווג + סימון כשלא נמצא מיפוי ב-productMap (נפל ל-fallbackProduct)
import React from 'react';
import type { ProductMatch } from '@/types/agentInsights';

export const MATCH_LABEL: Record<ProductMatch, string> = {
  key: 'מפתח',
  alias: 'alias',
  fallback: 'ברירת מחדל',
  none: 'לא זוהה',
};

export const isUnmapped = (m: ProductMatch) => m === 'fallback' || m === 'none';

/** איך זוהה המוצר — אותו חישוב כמו בשרת (makeResolver) */
export function matchFromDebug(r: {
  canonicalProduct?: string;
  debug?: { matchedByKey?: boolean; matchedByAlias?: boolean };
}): ProductMatch {
  if (r.debug?.matchedByKey) return 'key';
  if (r.debug?.matchedByAlias) return 'alias';
  return r.canonicalProduct ? 'fallback' : 'none';
}

const ClassifiedProduct: React.FC<{ product: string; matchedBy: ProductMatch }> = ({ product, matchedBy }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span>{product || '-'}</span>
    {isUnmapped(matchedBy) && (
      <span
        className="text-[10px] leading-none font-bold px-1.5 py-1 rounded bg-amber-100 text-amber-800 whitespace-nowrap"
        title="המוצר המקורי לא נמצא ב-productMap של התבנית — הוחל fallbackProduct"
      >
        {MATCH_LABEL[matchedBy]}
      </span>
    )}
  </span>
);

export default ClassifiedProduct;