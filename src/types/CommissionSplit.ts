export type CommissionSplit = {
  id: string;
  agentId: string;
  sourceLeadId: string;
  percentToAgent: number;
  percentToSourceLead: number;
  splitMode: 'commission' | 'production';
  // ריק = כל הקבוצות / כל המוצרים (הסכם כללי למקור הליד)
  productGroup?: string;
  product?: string;
};
