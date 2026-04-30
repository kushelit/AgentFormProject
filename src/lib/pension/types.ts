// types.ts

export type CurrentStateTrack = {
  trackName: string;
  trackAccumulation: number;
  allocationPercent?: number | null;
  netReturn?: number | null;
  annualCostPercent?: number | null;

  // 🆕 מפתח לצליבה עם גמל נט
  // נגזר מ-KOD-MASLUL-HASHKAA: 7 הספרות האחרונות
  // לדוגמה: "512065202000000000078570007978" → "7978"
  gemelNetId?: string | null;
};

export type CurrentStateRow = {
  insuredName: string;
  productType: string;
  companyName: string;
  policyNumber: string;
  planName?: string | null; 

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

  // 🆕 תשואות מגמל נט (ממולאות ע"י enrichRowsWithReturns)
  avgReturn1Y?: number | null;  // תשואה מצטברת שנה אחרונה
  avgReturn3Y?: number | null;  // ממוצע שנתי 3 שנים
  avgReturn5Y?: number | null;  // ממוצע שנתי 5 שנים

  // 🆕 האם נמצאה התאמה בגמל נט
  gemelNetMatched?: boolean;
  actuarialBalance?: number | null;
  
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