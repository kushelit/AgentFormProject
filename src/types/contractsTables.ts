export type VatMode = 'includes_vat' | 'excludes_vat';
export type CommissionType = 'hekef' | 'nifraim' | 'niud';
export type ValueMode = 'percent' | 'per_million';

export interface ProductSubGroupDoc {
  id: string;
  label: string;
  productGroupId: string;
  uiOrder: number;
  isActive: boolean;
}

export interface ProductsGroupDoc {
  id: string;
  productsGroupName: string;
  companyIds?: string[];
}

export interface ProductDoc {
  id: string;
  productName: string;
  productGroup: string;
  productSubGroupId?: string;
}

export interface CompanyDoc {
  id: string;
  companyName: string;
}

export interface ContractsTableRowConfig {
  commissionType: CommissionType;
  label: string;
  valueMode: ValueMode;
  minuySochen: boolean;
}

export interface ContractsTableSectionConfig {
  key: string;
  label: string;
  productGroupId: string;
  productSubGroupId: string;
  rows: ContractsTableRowConfig[];
}

export interface ContractsTableConfig {
  key: string;
  title: string;
  vatMode: VatMode;
  note: string;
  sections: ContractsTableSectionConfig[];
}