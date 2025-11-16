import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { SourceLead } from '@/types/SourceLead';

export const fetchSourceLeadsForAgent = async (agentId: string): Promise<SourceLead[]> => {
  if (!agentId) return [];

  const q = query(
    collection(db, 'sourceLead'),
    where('AgentId', '==', agentId),
    where('statusLead', '==', true)
  );

  try {
    const querySnapshot = await getDocs(q);
    // console.log("📥 docs received:", querySnapshot.docs.map(doc => doc.data()));

    return querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        AgentId: data.AgentId,
        sourceLead: data.sourceLead,
        statusLead: data.statusLead,
        ...data, // לשמירה על שדות נוספים אם יש
      } as SourceLead;
    });
  } catch (error) {
    // console.error('❌ שגיאה בשליפת לידים:', error);
    return [];
  }
};
