// src/utils/contractCommissionResolvers.ts
import type { TemplateDoc } from '@/types/ContractCommissionComparison';

export type ResolvedProduct = {
  productRaw?: string;
  canonicalProduct?: string;
  premiumFieldUsed?: string;
  debug: {
    matchedByAlias?: boolean;
    matchedByKey?: boolean;
    usedFallbackProduct?: boolean;
    usedDefaultPremiumField?: boolean;
  };
};

const norm = (v: any) =>
  String(v ?? '')
    .replace(/\u200f|\u200e|\ufeff/g, '') // RTL/BOM
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

/**
 * פתרון מוצר + premiumField מתוך template:
 * - קודם: התאמה לפי KEY של productMap (למי שמגדיר "gemel", "hishtalmut"...)
 * - אחר כך: התאמה לפי aliases (שם קופה כפי שמגיע בקובץ)
 * - אם לא נמצא: fallbackProduct
 * - premiumFieldUsed: קודם מ-productMap ואז defaultPremiumField
 */
export function resolveFromTemplate(
  template: TemplateDoc | null | undefined,
  productRaw: any
): ResolvedProduct {
  const raw = String(productRaw ?? '').trim();
  const rawNorm = norm(raw);

  const productMap = template?.productMap ?? {};
  const defaultPremiumField = String(template?.defaultPremiumField ?? '').trim() || undefined;
  const fallbackProduct = String(template?.fallbackProduct ?? '').trim() || undefined;

  let canonicalProduct: string | undefined;
  let premiumFieldUsed: string | undefined;

  let matchedByKey = false;
  let matchedByAlias = false;

  // 1) match by key in productMap
  if (rawNorm) {
    for (const [key, entry] of Object.entries(productMap)) {
      if (norm(key) === rawNorm) {
        matchedByKey = true;
        canonicalProduct = entry?.canonicalProduct || key;
        premiumFieldUsed = entry?.premiumField || undefined;
        break;
      }
    }
  }

  // 2) match by aliases
  if (!canonicalProduct && rawNorm) {
    for (const [key, entry] of Object.entries(productMap)) {
      const aliases = entry?.aliases ?? [];
      const hit = aliases.some(a => norm(a) === rawNorm);
      if (hit) {
        matchedByAlias = true;
        canonicalProduct = entry?.canonicalProduct || key;
        premiumFieldUsed = entry?.premiumField || undefined;
        break;
      }
    }
  }

  // 3) fallback product
  const usedFallbackProduct = !canonicalProduct && !!fallbackProduct;
  if (!canonicalProduct && fallbackProduct) {
    canonicalProduct = fallbackProduct;
  }

  // 4) premium field fallback
  const usedDefaultPremiumField = !premiumFieldUsed && !!defaultPremiumField;
  if (!premiumFieldUsed && defaultPremiumField) {
    premiumFieldUsed = defaultPremiumField;
  }

  return {
    productRaw: raw || undefined,
    canonicalProduct,
    premiumFieldUsed,
    debug: {
      matchedByAlias,
      matchedByKey,
      usedFallbackProduct,
      usedDefaultPremiumField,
    },
  };
}

/**
 * מחזיר premiumField עבור canonicalProduct אם יש לו entry ב-productMap
 * (שימושי אם בעתיד תרצי canonicalProduct == key)
 */
export function getPremiumFieldForCanonical(
  template: TemplateDoc | null | undefined,
  canonicalProduct: string | undefined
): string | undefined {
  if (!template?.productMap || !canonicalProduct) return undefined;

  const target = norm(canonicalProduct);

  for (const [key, entry] of Object.entries(template.productMap)) {
    const canon = entry?.canonicalProduct ? norm(entry.canonicalProduct) : norm(key);
    if (canon === target) {
      return entry?.premiumField || undefined;
    }
  }

  return undefined;
}
