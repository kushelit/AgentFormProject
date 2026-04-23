export type CurrentStateTrack = {
  trackName: string;
  trackAccumulation: number;
  allocationPercent?: number | null;
  netReturn?: number | null;
  annualCostPercent?: number | null;
};

export type CurrentStateRow = {
  insuredName: string;
  productType: string;
  companyName: string;
  policyNumber: string;

  status?: string | null;
  roleType?: string | null;

  accumulation: number;

  depositFeePercent?: number | null;
  balanceFeePercent?: number | null;

  trackDisplay: string;
  trackCount: number;
  tracks: CurrentStateTrack[];

  weightedNetReturn?: number | null;

  expectedPension?: number | null;
  expectedSavings?: number | null;

  avgReturn1Y?: number | null;
  avgReturn3Y?: number | null;
  avgReturn5Y?: number | null;
};

export type MeslekaPdfReturnRow = {
  companyName: string;
  productType: string;
  policyNumber: string;
  trackName?: string | null;

  trackAccumulation?: number | null;

  avgReturn1Y?: number | null;
  avgReturn3Y?: number | null;
  avgReturn5Y?: number | null;
};