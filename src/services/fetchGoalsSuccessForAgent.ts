import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { PromotionData, PromotionWithId, PromotionMapping, GoalDataType } from '@/types/Goal';



export const fetchGoalsSuccessForAgent = async (agentId: string): Promise<GoalDataType[]> => {
  const q = query(collection(db, 'goalsSuccess'), where('AgentId', '==', agentId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as GoalDataType[];
};
