export type CommissionSplit = {
  id: string;
  agentId: string;
  sourceLeadId: string;
  percentToAgent: number;
  percentToSourceLead: number;
  splitMode: 'commission' | 'production'; 
};
