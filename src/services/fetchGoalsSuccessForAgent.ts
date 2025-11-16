import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { GoalDataType } from '@/types/Goal';


export const fetchGoalsSuccessForAgent = async (UserAgentId: string): Promise<GoalDataType[]> => {
  // console.log("📡 1 Fetching goals for AgentId:", UserAgentId);
  const q = query(collection(db, "goalsSuccess"), where("AgentId", "==", UserAgentId));
  const querySnapshot = await getDocs(q);
  const data = querySnapshot.docs.map(doc => {
    const docData = doc.data();
    const goal: GoalDataType = {
      id: doc.id,
      AgentId: docData.AgentId ?? UserAgentId,
      promotionId: docData.promotionId ?? "",
      workerId: docData.workerId ?? "",
      goalsTypeId: docData.goalsTypeId ?? "",
      amaunt: docData.amaunt ?? 0,
      startDate: docData.startDate ?? "",
      endDate: docData.endDate ?? "",
      status: docData.status ?? false,
    };
    // console.log("📄 2 Fetched Goal:", goal);
    return goal;
  });

  // console.log("✅ 3 Returning Goals Data:", data);
  return data;
};
