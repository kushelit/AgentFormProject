/* eslint-disable max-len */
// functions/src/shared/insightsCache.ts
// ניקוי מטמון הסקירה (agentInsightsCache) של סוכן — לקריאה בסוף טעינה מוצלחת,
// כך שהכניסה הבאה לדף המסכם תחשב מחדש עם הנתונים החדשים.
import type { Firestore } from "firebase-admin/firestore";

export async function invalidateAgentInsightsCache(db: Firestore, agentId: string): Promise<void> {
  if (!agentId) return;
  const snap = await db.collection("agentInsightsCache").where("agentId", "==", agentId).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}