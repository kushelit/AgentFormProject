

import { useEffect, useState, ChangeEvent, ChangeEventHandler  } from 'react';
import { query, collection, where, getDocs, getDoc, doc, addDoc } from 'firebase/firestore';
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

  interface Goal {
    id?: string; // Optional: Firestore document ID (exists only when reading)
    AgentId: string; // The agent associated with the goal
    workerId: string; // The worker associated with the goal
    promotionId: string; // Associated promotion ID
    startDate: string; // Start date of the goal (YYYY-MM-DD)
    endDate: string; // End date of the goal (YYYY-MM-DD)
    amaunt: number; // Goal amaunt
    goalsTypeId: string; // Goal type ID
    status: boolean; // Goal status (e.g., "active", "completed")
    createdAt?: string; // Timestamp when the goal was created
  }
  
  interface Promotion {
    id: string; // Firestore document ID
    promotionMonthlyRepeat: boolean;
    promotionStartDate: string; // Format: YYYY-MM-DD
    promotionEndDate: string; // Format: YYYY-MM-DD
    promotionStatus: boolean;
    AgentId: string;
    [key: string]: any; // For any additional fields
  }
  



  const handleSelectPromotion: ChangeEventHandler<HTMLSelectElement> = (event) => {
    setPromotionValue(event.target.value);
    //console.log('promotionValue:',promotionValue);

  };
   
  const handleSelectGoalsType = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setGoalsTypeValue(event.target.value);
   // console.log('Selected goals type ID:', event.target.value);
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

     // console.log('Data set in state:', goalsTypeData);  // Correctly logs populated array
  } catch (error) {
     // console.error('Failed to fetch GoalsType:', error);
      setGoalsTypeList([]);
      setGoalsTypeMap({});
  }
};

useEffect(() => {
 // console.log('Updated goalsTypeList:', goalsTypeList);  // Check updated state on re-render
}, [goalsTypeList]);



const duplicateGoalsForNextMonth = async (selectedAgentId: string | null) => {
 
  if (!selectedAgentId) {
    // console.log('Error: selectedAgentId is null or undefined.');
    alert('בחר סוכן לשכפול יעדים לחודש הבא.');

    return;
  }
  try {
    const currentDate = new Date();

    // Define the current month's start and end dates
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    // Format as YYYY-MM-DD
    const formatDate = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const firstDayOfMonthString = formatDate(firstDayOfMonth);
    const lastDayOfMonthString = formatDate(lastDayOfMonth);

    // Step 1: Fetch promotions with promotionMonthlyRepeat = true and are active
    const promotionsQuery = query(
      collection(db, 'promotion'),
      where('promotionMonthlyRepeat', '==', true),
      where('promotionStartDate', '<=', firstDayOfMonthString),
      where('promotionEndDate', '>=', lastDayOfMonthString),
      where('promotionStatus', '==', true),
      where('AgentId', '==', selectedAgentId)
    );
    const promotionsSnapshot = await getDocs(promotionsQuery);

    if (promotionsSnapshot.empty) {
      // console.log('No active renewable promotions found.');
      return;
    }
    
    const promotions: Promotion[] = promotionsSnapshot.docs.map(doc => {
      const data = doc.data();

      return {
        id: doc.id,
        promotionMonthlyRepeat: data.promotionMonthlyRepeat ?? false,
        promotionStartDate: data.promotionStartDate ?? '',
        promotionEndDate: data.promotionEndDate ?? '',
        promotionStatus: data.promotionStatus ?? false,
        AgentId: data.AgentId ?? '',
        ...data, // Include any additional fields
      } as Promotion;
    });

    let goalsDuplicated = 0;

    // Step 2: For each promotion, find its associated goals for the current month
    for (const promotion of promotions) {
      const { id: promotionId, promotionEndDate } = promotion;

      // Extract year and month from current date and promotionEndDate
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();

      const promotionEndDateObj = new Date(promotionEndDate);
      const promotionEndMonth = promotionEndDateObj.getMonth();
      const promotionEndYear = promotionEndDateObj.getFullYear();

      // Skip promotions ending in the current month and year
      if (currentYear === promotionEndYear && currentMonth === promotionEndMonth) {
        // console.log(`Skipping promotion ${promotionId} as it ends within the current month.`);
        continue;
      }

      const goalsQuery = query(
        collection(db, 'goalsSuccess'),
        where('promotionId', '==', promotionId),
        where('startDate', '>=', firstDayOfMonthString),
        where('endDate', '<=', lastDayOfMonthString),
        where('status', '==', true)
      );

      const goalsSnapshot = await getDocs(goalsQuery);

      if (goalsSnapshot.empty) {
        // console.log(`No goals found for promotion: ${promotionId}`);
        continue;
      }

      // console.log('promotionId ' +  promotionId);
      // console.log('firstDayOfMonthString ' +  firstDayOfMonthString);
      // console.log('lastDayOfMonthString ' +  lastDayOfMonthString);
      // console.log('selectedAgentId ' +  selectedAgentId);

      // Map Firestore documents to Goal interface
      const goals: Goal[] = goalsSnapshot.docs.map(doc => {
        const data = doc.data();

        return {
          id: doc.id,
          AgentId: data.AgentId ?? '',
          workerId: data.workerId ?? '',
          promotionId: data.promotionId ?? '',
          startDate: data.startDate ?? '',
          endDate: data.endDate ?? '',
          amaunt: data.amaunt ?? 0,
          goalsTypeId: data.goalsTypeId ?? '',
          status: data.status ?? true,
          createdAt: data.createdAt, // Optional
        } as Goal;
      });

      // Step 3: Duplicate goals for the next month
      for (const goal of goals) {
        const newStartDate = new Date(goal.startDate);
        newStartDate.setMonth(newStartDate.getMonth() + 1);

        const newEndDate = new Date(goal.endDate);
        newEndDate.setMonth(newEndDate.getMonth() + 1);

        const newGoal: Goal = {
          AgentId: goal.AgentId,
          workerId: goal.workerId,
          promotionId,
          startDate: formatDate(newStartDate), // New start date (YYYY-MM-DD)
          endDate: formatDate(newEndDate), // New end date (YYYY-MM-DD)
          amaunt: goal.amaunt,
          goalsTypeId: goal.goalsTypeId,
          status: true, // Default new goal status
          createdAt: new Date().toISOString(), // Timestamp for the new goal
        };

        // Step 4: Save the new goal in the goalsSuccess table
        await addDoc(collection(db, 'goalsSuccess'), newGoal);
        // console.log('New goal created for next month:', newGoal);
        goalsDuplicated++;

      }
    }
// Notify user about the results
if (goalsDuplicated > 0) {
  alert(`שוכפלו בהצלחה  ${goalsDuplicated} לחודש הבא.`);
} else {
  alert('לא נמצאו יעדים לשכפל לחודש הבא.');
}


  } catch (error) {
    // console.error('Error duplicating goals for the next month:', error);
    alert('An error occurred while duplicating goals. Please check the console for more details.');

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
    goalsTypeMap,
    fetchGoalsTypeData,
    duplicateGoalsForNextMonth
   
  };
  
  
};
  export default useGoalsMD;