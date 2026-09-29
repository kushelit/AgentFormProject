// src/lib/insights/transfers.ts
// ניודים אפשריים בפנסיה — עזרי תצוגה משותפים (סימון בלבד; החישוב ב-computeInsights → computeTransfers).
import type { TransferSuspect } from '@/types/agentInsights';

const canon = (v: any) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');

/** מפתח התאמה בין רשימת הפוליסות לבין הסימון: מספר פוליסה + ת"ז קנונית */
export const transferKey = (policyNumberKey: string, customerId: string) => `${String(policyNumberKey ?? '').trim()}|${canon(customerId)}`;

const money = (v: number) => Number(v || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 });
const pct = (v: number) => `${Number(v || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })}%`;

/** הסבר קצר לכל סימן — למה הפוליסה נראית כמו ניוד */
export function transferReasonText(t: TransferSuspect): string[] {
  const out: string[] = [];
  if (t.reasons.includes('spike')) {
    out.push(`קפיצה: ${money(t.prevPremium ?? 0)} ₪ בחודש הקודם → ${money(t.premium)} ₪ החודש`);
  }
  if (t.reasons.includes('low_rate')) {
    out.push(`אחוז עמלה ${pct(t.rate)} מול ${pct(t.peerRate ?? 0)} בפוליסות דומות`);
  }
  return out;
}