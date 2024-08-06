

import { useEffect, useState, ChangeEvent, ChangeEventHandler  } from 'react';
import { query, collection, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 



const useGoalsMD = () => {

  
    const { 
      selectedAgentId, 
  
    } = useFetchAgentData();
  
   

  const [promotionList, SetPromotionList] = useState<any[]>([]);
  const [promotionValue, setPromotionValue] = useState<string | null>(null);
  const [goalsTypeValue, setGoalsTypeValue] = useState<string | null>(null);

  const [goalsTypeList,   setGoalsTypeList] = useState<GoalsType[]>([]);

  const [goalsTypeMap, setGoalsTypeMap] = useState<GoalsTypeMap>({});

  interface GoalsTypeMap {
    [key: string]: string;
  }


  interface GoalsType {
    name: string;
    id: string;
  }


  const handleSelectPromotion: ChangeEventHandler<HTMLSelectElement> = (event) => {
    setPromotionValue(event.target.value);
    console.log('promotionValue:',promotionValue);

  };
   
  const handleSelectGoalsType = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setGoalsTypeValue(event.target.value);
    console.log('Selected goals type ID:', event.target.value);
};

 

  const fetchGoalsTypeData_Old = async () => {
    try {
        const querySnapshot = await getDocs(collection(db, 'goalsType'));
        const fetchedGoalsTypeList = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name, 
        }));
        setGoalsTypeList(fetchedGoalsTypeList);
    } catch (error) {
        console.error("Error fetching goals types:", error);
    }
};

useEffect(() => {
    fetchGoalsTypeData(selectedAgentId);
}, [selectedAgentId]); // Run once on component mount
  
 

const fetchGoalsTypeData = async (agentId: string) => {
  if (!agentId) {
    setGoalsTypeList([]);
    setGoalsTypeMap({});
    return;
  }
  const GoalsTypeQuery = query(collection(db, 'goalsType'));
  try {
    const querySnapshot = await getDocs(GoalsTypeQuery);
    const goalsTypeData: GoalsType[] = [];
    const goalsTypeMap: GoalsTypeMap = {};

    querySnapshot.forEach(doc => {
      const data = doc.data() as GoalsType; // Assume data always contains 'name'
      goalsTypeData.push({ id: doc.id, name: data.name });
      goalsTypeMap[doc.id] = data.name; // Build the map
    });

    setGoalsTypeList(goalsTypeData); // Update the workers list
    console.log('goalsTypeData:',goalsTypeData);
    setGoalsTypeMap(goalsTypeMap); // Update the map for quick lookup
  } catch (error) {
    console.error('Failed to fetch GoalsType:', error);
    setGoalsTypeList([]);
    setGoalsTypeMap({});
  }
};


   return {

    SetPromotionList,
    promotionList,
    promotionValue,
    setPromotionValue,
    handleSelectPromotion,
    goalsTypeList,
    handleSelectGoalsType,
    goalsTypeValue,
    setGoalsTypeValue,
    goalsTypeMap
   
  };
  
  
};
  export default useGoalsMD;