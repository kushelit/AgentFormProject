export type SheetMatchRule = {
  exact?: string[];
  contains?: string[];
  startsWith?: string[];
};

export type MultiSheetSystemFieldOverrideValue = string | string[];

export type MultiSheetProfileSheet = {
  key: string;
  label?: string;
  match: SheetMatchRule;
  templateId: string;
  overrideSystemFields?: Record<string, MultiSheetSystemFieldOverrideValue>;
  isRequired?: boolean;
  skipIfEmpty?: boolean;
  lookupCustomerIdByPolicy?: boolean;
};

export type MultiSheetImportProfile = {
  id: string;
  name: string;
  isActive: boolean;
  scope?: {
    agentId?: string[];
    agencyId?: string[];
  };
  sheets: MultiSheetProfileSheet[];
  ignoreSheets?: string[];
  enableReportMonthFilter?: boolean;
};