import type { SalesToCompareCommissions } from '@/types/Sales';
import type { ContractForCompareCommissions } from '@/types/Contract';




interface Product {
  productName: string;
  productGroup: string;
  isOneTime?: boolean;
}

export function calculateCommissions(
  sale: SalesToCompareCommissions,
  contractMatch: any,
  contracts: ContractForCompareCommissions[],
  productMap: Record<string, Product>,
  selectedAgentId: string
) {
  let commissionHekef = 0;
  let commissionNifraim = 0;

  const product = productMap[sale.product];
  const isOneTime = product?.isOneTime ?? false;
  const multiplier = isOneTime ? 1 : 12;

  if (contractMatch) {
    commissionHekef = (
      (parseFloat(sale.insPremia ?? '0') * contractMatch.commissionHekef / 100 * multiplier) +
      (parseFloat(sale.pensiaPremia ?? '0') * contractMatch.commissionHekef / 100 * multiplier) +
      (parseFloat(sale.pensiaZvira ?? '0') * contractMatch.commissionNiud / 100) +
      (parseFloat(sale.finansimPremia ?? '0') * contractMatch.commissionHekef / 100 * multiplier) +
      (parseFloat(sale.finansimZvira ?? '0') * contractMatch.commissionNiud / 100)
    );

    if (!isOneTime) {
      commissionNifraim = (
        (parseFloat(sale.insPremia ?? '0') * contractMatch.commissionNifraim / 100) +
        (parseFloat(sale.pensiaPremia ?? '0') * contractMatch.commissionNifraim / 100) +
        (parseFloat(sale.finansimZvira ?? '0') * contractMatch.commissionNifraim / 100 / 12)
      );
    }

  } else {
    const groupMatch = contracts.find(contract =>
      contract.productsGroup === product?.productGroup &&
      contract.AgentId === selectedAgentId &&
      (contract.minuySochen === sale.minuySochen || (contract.minuySochen === undefined && !sale.minuySochen))
    );

    if (groupMatch) {
      commissionHekef = (
        (parseFloat(sale.insPremia ?? '0') * groupMatch.commissionHekef / 100 * multiplier) +
        (parseFloat(sale.pensiaPremia ?? '0') * groupMatch.commissionHekef / 100 * multiplier) +
        (parseFloat(sale.pensiaZvira ?? '0') * groupMatch.commissionNiud / 100) +
        (parseFloat(sale.finansimPremia ?? '0') * groupMatch.commissionHekef / 100 * multiplier) +
        (parseFloat(sale.finansimZvira ?? '0') * groupMatch.commissionNiud / 100)
      );

      if (!isOneTime) {
        commissionNifraim = (
          (parseFloat(sale.insPremia ?? '0') * groupMatch.commissionNifraim / 100) +
          (parseFloat(sale.pensiaPremia ?? '0') * groupMatch.commissionNifraim / 100) +
          (parseFloat(sale.finansimZvira ?? '0') * groupMatch.commissionNifraim / 100 / 12)
        );
      }
    }
  }

  return {
    commissionHekef: Math.round(commissionHekef),
    commissionNifraim: Math.round(commissionNifraim)
  };
}
  