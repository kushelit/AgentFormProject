import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { CommissionSplit } from '@/types/CommissionSplit'; 

// services/splitsService.ts

export const fetchSplits = async (selectedAgentId: string): Promise<CommissionSplit[]> => {
  if (!selectedAgentId) return [];

  const q = query(
    collection(db, 'commissionSplits'),
    where('agentId', '==', selectedAgentId)
  );

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        agentId: data.agentId,
        sourceLeadId: data.sourceLeadId,
        percentToAgent: data.percentToAgent,
        percentToSourceLead: data.percentToSourceLead,
        splitMode: (data.splitMode as 'commission' | 'production') || 'commission', 
      };
    });
  } catch (error) {
    // console.error('שגיאה בשליפת פיצולים:', error);
    return [];
  }
};
