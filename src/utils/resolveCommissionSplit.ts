import type { CommissionSplit } from '@/types/CommissionSplit';

// ללא תלות ב-Firebase – משמש גם בצד הלקוח וגם בצד השרת.

const canon = (v: any) => String(v ?? '').trim();

export type SplitLookup = {
  agentId: string;
  sourceLeadId: string;
  product?: string;
  productGroup?: string;
};

/**
 * בוחר את הסכם הפיצול המתאים ביותר לעסקה, לפי סדר עדיפות:
 * 1. הסכם למקור הליד + המוצר
 * 2. הסכם למקור הליד + קבוצת המוצר
 * 3. הסכם כללי למקור הליד (ללא קבוצה וללא מוצר)
 * אם אין התאמה → undefined (100% לסוכן).
 */
export function resolveCommissionSplit(
  splits: CommissionSplit[],
  lookup: SplitLookup
): CommissionSplit | undefined {
  const agentId = canon(lookup.agentId);
  const sourceLeadId = canon(lookup.sourceLeadId);
  if (!agentId || !sourceLeadId) return undefined;

  const product = canon(lookup.product);
  const productGroup = canon(lookup.productGroup);

  const candidates = (splits || []).filter(
    (s) => canon(s.agentId) === agentId && canon(s.sourceLeadId) === sourceLeadId
  );
  if (!candidates.length) return undefined;

  if (product) {
    const byProduct = candidates.find((s) => canon(s.product) === product);
    if (byProduct) return byProduct;
  }

  if (productGroup) {
    const byGroup = candidates.find(
      (s) => !canon(s.product) && canon(s.productGroup) === productGroup
    );
    if (byGroup) return byGroup;
  }

  return candidates.find((s) => !canon(s.product) && !canon(s.productGroup));
}
