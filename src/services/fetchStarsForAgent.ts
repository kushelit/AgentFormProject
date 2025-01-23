import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { StarDataType } from '@/types/Goal';

export const fetchStarsForAgent = async (UserAgentId: string): Promise<StarDataType[]> => {
  const q = query(
    collection(db, 'stars'),
    where('AgentId', '==', UserAgentId)
  );

  const querySnapshot = await getDocs(q);
  const data = querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as StarDataType[];

  return data;
};

export default fetchStarsForAgent;

