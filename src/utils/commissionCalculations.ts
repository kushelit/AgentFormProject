import type { SalesToCompareCommissions } from '@/types/Sales';
import type { ContractForCompareCommissions } from '@/types/Contract';


export function calculateCommissions(
    sale: SalesToCompareCommissions,
    contractMatch: any,
    contracts: ContractForCompareCommissions[],
    productMap: Record<string, string>,
    selectedAgentId: string
  ) {
    let commissionHekef = 0;
    let commissionNifraim = 0;
  
    if (contractMatch) {
        commissionHekef = (
            (parseFloat(sale.insPremia ?? '0') * contractMatch.commissionHekef / 100 * 12) +
            (parseFloat(sale.pensiaPremia ?? '0') * contractMatch.commissionHekef / 100 * 12) +
            (parseFloat(sale.pensiaZvira ?? '0') * contractMatch.commissionNiud / 100) +
            (parseFloat(sale.finansimPremia ?? '0') * contractMatch.commissionHekef / 100 * 12) +
            (parseFloat(sale.finansimZvira ?? '0') * contractMatch.commissionNiud / 100)
          );
          
          commissionNifraim = (
            (parseFloat(sale.insPremia ?? '0') * contractMatch.commissionNifraim / 100) +
            (parseFloat(sale.pensiaPremia ?? '0') * contractMatch.commissionNifraim / 100) +
            (parseFloat(sale.finansimZvira ?? '0') * contractMatch.commissionNifraim / 100 / 12)
          );
          
          
    } else {
      const productGroup = productMap[sale.product];
      const groupMatch = contracts.find(contract =>
        contract.productsGroup === productGroup &&
        contract.agentId === selectedAgentId &&
        (contract.minuySochen === sale.minuySochen || (contract.minuySochen === undefined && !sale.minuySochen))
      );
  
      if (groupMatch) {
        commissionHekef = (
            (parseFloat(sale.insPremia ?? '0') * groupMatch.commissionHekef / 100 * 12) +
            (parseFloat(sale.pensiaPremia ?? '0') * groupMatch.commissionHekef / 100 * 12) +
            (parseFloat(sale.pensiaZvira ?? '0') * groupMatch.commissionNiud / 100) +
            (parseFloat(sale.finansimPremia ?? '0') * groupMatch.commissionHekef / 100 * 12) +
            (parseFloat(sale.finansimZvira ?? '0') * groupMatch.commissionNiud / 100)
          );
          
          commissionNifraim = (
            (parseFloat(sale.insPremia ?? '0') * groupMatch.commissionNifraim / 100) +
            (parseFloat(sale.pensiaPremia ?? '0') * groupMatch.commissionNifraim / 100) +
            (parseFloat(sale.finansimZvira ?? '0') * groupMatch.commissionNifraim / 100 / 12)
          );
          
      }
    }
  
    return {
      commissionHekef: Math.round(commissionHekef),
      commissionNifraim: Math.round(commissionNifraim)
    };
  }
  