

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
    productGroup: string;
  }


  const handleSelectPromotion: ChangeEventHandler<HTMLSelectElement> = (event) => {
    setPromotionValue(event.target.value);
    console.log('promotionValue:',promotionValue);

  };
   
  const handleSelectGoalsType = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setGoalsTypeValue(event.target.value);
    console.log('Selected goals type ID:', event.target.value);
};


useEffect(() => {
  fetchGoalsTypeData();
}, []);


const fetchGoalsTypeData = async () => {
  const GoalsTypeQuery = query(collection(db, 'goalsType'));
  try {
      const querySnapshot = await getDocs(GoalsTypeQuery);
      const goalsTypeData: GoalsType[] = [];  // Explicitly typing the array
      const goalsTypeMap: { [key: string]: string } = {};

      querySnapshot.forEach(doc => {
          const data = doc.data() as GoalsType;  // Cast the data to GoalsType
          goalsTypeData.push({ id: doc.id, name: data.name, productGroup: data.productGroup });
          goalsTypeMap[doc.id] = data.name;
      });

      setGoalsTypeList(goalsTypeData);  // Updates state
      setGoalsTypeMap(goalsTypeMap);

      console.log('Data set in state:', goalsTypeData);  // Correctly logs populated array
  } catch (error) {
      console.error('Failed to fetch GoalsType:', error);
      setGoalsTypeList([]);
      setGoalsTypeMap({});
  }
};

useEffect(() => {
  console.log('Updated goalsTypeList:', goalsTypeList);  // Check updated state on re-render
}, [goalsTypeList]);


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
    goalsTypeMap,
    fetchGoalsTypeData
   
  };
  
  
};
  export default useGoalsMD;