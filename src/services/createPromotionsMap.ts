// src/services/promotionsService.ts
import { PromotionWithId, PromotionMapping } from "@/types/Goal";

export const createPromotionsMap = (
  promotions: PromotionWithId[]
): PromotionMapping => {
  return promotions.reduce((acc, promotion) => {
    if (promotion.promotionName) {
      acc[promotion.id] = promotion.promotionName;
    }
    return acc;
  }, {} as PromotionMapping);
};
