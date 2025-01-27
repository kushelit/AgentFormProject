// "@/types/Goal"

export interface Contract {
  id: string;
  AgentId: string;
  productsGroup: string;
  minuySochen: boolean;
  commissionHekef?: number;
  commissionNifraim?: number;
  commissionNiud?: number;
  [key: string]: any; // עבור תכונות נוספות
}
export interface ContractAgent {
  id: string;
  company: string;
  product: string;
  commissionHekef: number;
  commissionNifraim: number;
  commissionNiud: number;
  minuySochen: boolean;
}
