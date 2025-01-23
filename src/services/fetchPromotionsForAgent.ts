import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { PromotionData, PromotionWithId, PromotionMapping } from '@/types/Goal';

 const fetchPromotionsForAgent = async (
  UserAgentId: string
): Promise<PromotionWithId[]> => {
  const q = query(
    collection(db, "promotion"),
    where("AgentId", "==", UserAgentId)
  );

  try {
    const querySnapshot = await getDocs(q);
    const promotions: PromotionWithId[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data() as PromotionData;
      promotions.push({ id: doc.id, ...data });
    });

    return promotions;
  } catch (error) {
    console.error("Error fetching promotions:", error);
    return [];
  }
};


export default fetchPromotionsForAgent;
