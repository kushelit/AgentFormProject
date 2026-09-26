// src/lib/insights/clearInsightsCache.ts
// ניקוי מטמון הסקירה של סוכן (כל השנים) — לקריאה אחרי מחיקה גורפת בדף ה-purge.
import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

export async function clearAgentInsightsCache(agentId: string) {
  if (!agentId) return;
  const snap = await getDocs(
    query(collection(db, 'agentInsightsCache'), where('agentId', '==', agentId))
  );
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
