export type SheetMatchRule = {
  exact?: string[];
  contains?: string[];
  startsWith?: string[];
};

export type MultiSheetProfileSheet = {
  key: string;
  label?: string;
  match: SheetMatchRule;
  templateId: string;
  overrideSystemFields?: Record<string, string>;
  isRequired?: boolean;
  skipIfEmpty?: boolean;
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
};