

import { useEffect, useState, ChangeEvent, ChangeEventHandler  } from 'react';
import { query, collection, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 



const useGoalsMD = () => {

  
    const { 
      selectedAgentId, 
  
    } = useFetchAgentData();
  
   

  const [promotionList, SetPromotionList] = useState<any[]>([]);
  const [promotionListForStars, setPromotionListForStars] = useState<PromotionMapping>({});
  const [promotionValue, setPromotionValue] = useState<string | null>(null);
  const [goalsTypeValue, setGoalsTypeValue] = useState<string | null>(null);

  const [goalsTypeList,   setGoalsTypeList] = useState<any[]>([]);


  interface PromotionData {
    promotionName: string;
  }
  
  interface PromotionMapping {
    [key: string]: string;
  }


  const fetchPromotionsForAgent = async (UserAgentId: string) => {
    const q = query(
      collection(db, 'promotion'), 
      where('AgentId', '==', UserAgentId)
    );
    try {
      const querySnapshot = await getDocs(q);
      const promotionsMap: PromotionMapping = {};
      if (querySnapshot.empty) {
        SetPromotionList([]); // Clear the state if no promotions are found
        console.log('No promotions found for agent:', UserAgentId);
        setPromotionListForStars({}); // Clear the state if no promotions are found
      } else {
        querySnapshot.forEach(doc => {
          const data = doc.data() as PromotionData;
          SetPromotionList(prev => [...prev, { id: doc.id, ...data }]);
          if (typeof data.promotionName === 'string') {
            promotionsMap[doc.id] = data.promotionName;
          } else {
            console.error('Promotion name missing or invalid for document:', doc.id);
          }
        });
        
        setPromotionListForStars(promotionsMap); // Store the mapping
        console.log('Promotions fetched and mapped:', promotionsMap);
      }
    } catch (error) {
      console.error('Error fetching promotions:', error);
      setPromotionListForStars({}); // Clear the state in case of error
    }
  };
 
  const handleSelectPromotion: ChangeEventHandler<HTMLSelectElement> = (event) => {
    setPromotionValue(event.target.value);
    console.log('promotionValue:',promotionValue);

  };
   
  const handleSelectGoalsType = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setGoalsTypeValue(event.target.value);
    console.log('Selected goals type ID:', event.target.value);
};

  useEffect(() => {
    if (selectedAgentId) {
      fetchPromotionsForAgent(selectedAgentId);
    }  
  }, [selectedAgentId]); // Ensure this effect runs whenever selectedProduct or products change
  


  const fetchGoalsTypeData = async () => {
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
    fetchGoalsTypeData();
}, []); // Run once on component mount
  
   

   return {

    SetPromotionList,
    promotionList,
    promotionListForStars,
    setPromotionListForStars,
    promotionValue,
    setPromotionValue,
    handleSelectPromotion,
    goalsTypeList,
    handleSelectGoalsType,
    goalsTypeValue,
    setGoalsTypeValue,
   
  };
  
  
};
  export default useGoalsMD;