// config/elementaryContractsConfig.ts

// ─── Company types ────────────────────────────────────────────────────────────

// חברות ידניות — אחוז עמלה מוזן ידנית לכל עסקה, ללא נוסחת 58%
// (מגיע מ-Firestore עם elementaryManual: true)
// הקונפיג הזה נשמר רק לפונקציית החישוב

// נוסחת עמלה לחברות אוטומטיות:
// עמלה = (פרמיה × 0.58) × (commissionRate / 100)
export const ELEMENTARY_NET_FACTOR = 0.58;

export function calcElementaryCommission(
  premium: number,
  commissionRate: number
): number {
  return Math.round(premium * ELEMENTARY_NET_FACTOR * (commissionRate / 100));
}

// ─── DB Types (מה שמגיע מ-Firestore) ────────────────────────────────────────

export type ElementaryProductGroup = {
  id: string;
  label: string;
  order: number;
};

export type ElementaryProduct = {
  id: string;
  label: string;
  productGroupId: string;
  hasMozalTrack: boolean;
  order: number;
};