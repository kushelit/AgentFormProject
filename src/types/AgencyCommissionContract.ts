// /types/AgencyCommissionContract.ts
export type AgencyCommissionContractType = 'default' | 'perProduct';

export interface AgencyCommissionContract {
  id: string;
  agencyId: string;

  type: AgencyCommissionContractType; // "default" = לפי קבוצת מוצר, "perProduct" = מוצר ספציפי

  company: string;        // "" אם זה הסכם ברירת מחדל לפי group
  productsGroup: string;  // "" אם זה הסכם למוצר ספציפי
  product: string;        // "" אם זה הסכם לפי group

  commissionHekef: number;
  commissionNifraim: number;
  commissionNiud: number;
  minuySochen: boolean;
}
