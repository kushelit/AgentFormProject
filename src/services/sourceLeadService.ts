import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

export interface SourceLead {
  id: string;
  [key: string]: any;
}

export const fetchSourceLeadsForAgent = async (agentId: string): Promise<SourceLead[]> => {
  if (!agentId) return [];

  const q = query(
    collection(db, 'sourceLead'),
    where('AgentId', '==', agentId),
    where('statusLead', '==', true)
  );

  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('❌ שגיאה בשליפת לידים:', error);
    return [];
  }
};
