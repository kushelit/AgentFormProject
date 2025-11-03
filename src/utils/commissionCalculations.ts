import type { SalesToCompareCommissions } from '@/types/Sales';
import type { ContractForCompareCommissions } from '@/types/Contract';

interface Product {
  productName: string;
  productGroup: string;
  isOneTime?: boolean;
}

export const toNumber = (val: any): number => {
  const num = parseFloat((val ?? '').toString().trim());
  return isNaN(num) ? 0 : num;
};

/**
 * חישוב עמלות (הקף/נפרעים) עם תמיכה בפיצול אופציונלי.
 * opts.splitPercent = אחוז לסוכן (0..100), ברירת־מחדל 100.
 */
export function calculateCommissions(
  sale: SalesToCompareCommissions,
  contractMatch: ContractForCompareCommissions | null | undefined,
  contracts: ContractForCompareCommissions[],
  productMap: Record<string, Product>,
  selectedAgentId: string,
  opts?: { splitPercent?: number }
): { commissionHekef: number; commissionNifraim: number } {
  let commissionHekef = 0;
  let commissionNifraim = 0;

  // הבטחת טווח 0..100 ו־default ל־100
  const splitPercent = Math.max(0, Math.min(100, opts?.splitPercent ?? 100));

  // נרמול מפתח המוצר
  const productKey = (sale.product ?? '').toString().trim();
  const product = productMap[productKey];
  const isOneTime = product?.isOneTime ?? false;
  const multiplier = isOneTime ? 1 : 12;

  const to2 = (v: number) => Number(v.toFixed(2));


  if (contractMatch) {
    // חישוב לפי חוזה מדויק
    commissionHekef =
      toNumber(sale.insPremia)      * contractMatch.commissionHekef   / 100 * multiplier +
      toNumber(sale.pensiaPremia)   * contractMatch.commissionHekef   / 100 * multiplier +
      toNumber(sale.pensiaZvira)    * contractMatch.commissionNiud    / 100 +
      toNumber(sale.finansimPremia) * contractMatch.commissionHekef   / 100 * multiplier +
      toNumber(sale.finansimZvira)  * contractMatch.commissionNiud    / 100;

    if (!isOneTime) {
      commissionNifraim =
        toNumber(sale.insPremia)     * contractMatch.commissionNifraim / 100 +
        toNumber(sale.pensiaPremia)  * contractMatch.commissionNifraim / 100 +
        toNumber(sale.finansimZvira) * contractMatch.commissionNifraim / 100 / 12;
    }
  } else {
    // נפילה לקבוצת מוצר
    const groupMatch = contracts.find(c =>
      c.productsGroup === product?.productGroup &&
      c.AgentId === selectedAgentId &&
      (!!c.minuySochen === !!sale.minuySochen)
    );

    if (groupMatch) {
      commissionHekef =
        toNumber(sale.insPremia)      * groupMatch.commissionHekef     / 100 * multiplier +
        toNumber(sale.pensiaPremia)   * groupMatch.commissionHekef     / 100 * multiplier +
        toNumber(sale.pensiaZvira)    * groupMatch.commissionNiud      / 100 +
        toNumber(sale.finansimPremia) * groupMatch.commissionHekef     / 100 * multiplier +
        toNumber(sale.finansimZvira)  * groupMatch.commissionNiud      / 100;

      if (!isOneTime) {
        commissionNifraim =
          toNumber(sale.insPremia)      * groupMatch.commissionNifraim / 100 +
          toNumber(sale.pensiaPremia)   * groupMatch.commissionNifraim / 100 +
          toNumber(sale.finansimZvira)  * groupMatch.commissionNifraim / 100 / 12;
      }
    }
  }

  // החלת פיצול בסוף (מניעת עיגול כפול)
  commissionHekef   = Math.round(commissionHekef   * splitPercent / 100);
  commissionNifraim = Math.round(commissionNifraim * splitPercent / 100);

//   commissionHekef   = to2(commissionHekef   * splitPercent / 100);
// commissionNifraim = to2(commissionNifraim * splitPercent / 100);


  return { commissionHekef, commissionNifraim };
}

export function calculatePremiaAndTzvira(
  sale: SalesToCompareCommissions
): { sumPremia: number; sumTzvira: number } {
  const premia =
    toNumber(sale.insPremia) +
    toNumber(sale.pensiaPremia) +
    toNumber(sale.finansimPremia);

  const tzvira =
    toNumber(sale.pensiaZvira) +
    toNumber(sale.finansimZvira);

  return { sumPremia: premia, sumTzvira: tzvira };
}
