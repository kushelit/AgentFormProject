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

export function calculateCommissions(
  sale: SalesToCompareCommissions,
  contractMatch: any,
  contracts: ContractForCompareCommissions[],
  productMap: Record<string, Product>,
  selectedAgentId: string
) {
  let commissionHekef = 0;
  let commissionNifraim = 0;

  const productKey = sale.product?.trim() ?? '';

  console.log("🔎 sale.product raw:", sale.product);
  console.log("🔍 אחרי trim:", productKey);
  console.log("🗺️ מפת מוצרים זמינה:", Object.keys(productMap));
  console.log("🧪 האם productKey נמצא במפה?", productKey in productMap);
  
  const product = productMap[productKey];
  
  if (!product) {
    console.warn("🚨 לא נמצא מוצר תואם במפה ל:", productKey);
  } else {
    console.log("✅ מוצר תואם נמצא:", product);
  }
  

  const isOneTime = product?.isOneTime ?? false;
  const multiplier = isOneTime ? 1 : 12;

  if (contractMatch) {
    commissionHekef = (
      toNumber(sale.insPremia) * contractMatch.commissionHekef / 100 * multiplier +
      toNumber(sale.pensiaPremia) * contractMatch.commissionHekef / 100 * multiplier +
      toNumber(sale.pensiaZvira) * contractMatch.commissionNiud / 100 +
      toNumber(sale.finansimPremia) * contractMatch.commissionHekef / 100 * multiplier +
      toNumber(sale.finansimZvira) * contractMatch.commissionNiud / 100
    );

    if (!isOneTime) {
      commissionNifraim = (
        toNumber(sale.insPremia) * contractMatch.commissionNifraim / 100 +
        toNumber(sale.pensiaPremia) * contractMatch.commissionNifraim / 100 +
        toNumber(sale.finansimZvira) * contractMatch.commissionNifraim / 100 / 12
      );
    }

  } else {


    console.log("🔍 בדיקת חוזים לפי קבוצת מוצר:");
    console.log("📌 productGroup מהמוצר:", product?.productGroup);
    console.log("📌 AgentId נבחר:", selectedAgentId);
    console.log("📌 minuySochen מהמכירה:", sale.minuySochen);
  
    contracts.forEach((contract, i) => {
      console.log(`--- חוזה ${i + 1} ---`);
      console.log("productsGroup:", contract.productsGroup);
      console.log("AgentId:", contract.AgentId);
      console.log("minuySochen:", contract.minuySochen);
    });
    const groupMatch = contracts.find(contract =>
      contract.productsGroup === product?.productGroup &&
      contract.AgentId === selectedAgentId &&
      (!!contract.minuySochen === !!sale.minuySochen)
    );
console.log('🔍 חיפוש קבוצת מוצר:', product?.productGroup, 'נמצא:', groupMatch);
    if (groupMatch) {
      commissionHekef = (
        toNumber(sale.insPremia) * groupMatch.commissionHekef / 100 * multiplier +
        toNumber(sale.pensiaPremia) * groupMatch.commissionHekef / 100 * multiplier +
        toNumber(sale.pensiaZvira) * groupMatch.commissionNiud / 100 +
        toNumber(sale.finansimPremia) * groupMatch.commissionHekef / 100 * multiplier +
        toNumber(sale.finansimZvira) * groupMatch.commissionNiud / 100
      );

      if (!isOneTime) {
        commissionNifraim = (
          toNumber(sale.insPremia) * groupMatch.commissionNifraim / 100 +
          toNumber(sale.pensiaPremia) * groupMatch.commissionNifraim / 100 +
          toNumber(sale.finansimZvira) * groupMatch.commissionNifraim / 100 / 12
        );
      }
    }
  }

  return {
    commissionHekef: Math.round(commissionHekef),
    commissionNifraim: Math.round(commissionNifraim)
  };
}



export function calculatePremiaAndTzvira(sale: SalesToCompareCommissions) {
  const premia =
    toNumber(sale.insPremia) +
    toNumber(sale.pensiaPremia) +
    toNumber(sale.finansimPremia);

  const tzvira =
    toNumber(sale.pensiaZvira) +
    toNumber(sale.finansimZvira);

  return {
    sumPremia: premia,
    sumTzvira: tzvira
  };

  
}
