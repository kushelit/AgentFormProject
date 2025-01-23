// "@/types/Goal"

export interface PromotionData {
  promotionName: string;
  companies?: string[];
  promotionMonthlyRepeat?: boolean;
  promotionStartDate?: string;
  promotionEndDate?: string;
  promotionStatus?: boolean;
}

export interface PromotionWithId extends PromotionData {
  id: string;
}

export interface PromotionMapping {
  [key: string]: string;
}

export interface StarDataType {
  id: string;
  promotionId: string;
  insuranceStar: number;
  pensiaStar: number;
  finansimStar: number;
}

export interface GoalDataType {
  id: string;
  promotionId: string;
  workerId: string;
  goalsTypeId: string;
  amaunt: number | null;
  startDate: string | null;
  endDate: string | null;
  status: boolean;
}

