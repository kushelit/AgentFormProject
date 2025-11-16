import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { CommissionSplit } from '@/types/CommissionSplit'; 

export const fetchSplits = async (selectedAgentId: string): Promise<CommissionSplit[]> => {
  if (!selectedAgentId) return [];

  const q = query(
    collection(db, 'commissionSplits'),
    where('agentId', '==', selectedAgentId)
  );

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as CommissionSplit[];
  } catch (error) {
    // console.error('שגיאה בשליפת פיצולים:', error);
    return [];
  }
};
