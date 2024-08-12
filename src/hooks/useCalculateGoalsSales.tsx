import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';
import useGoalsMD from "@/hooks/useGoalsMD"; 
import useFetchMD from "@/hooks/useMD"; 
import useFetchAgentData from "@/hooks/useFetchAgentData"; 



  
function useCalculateSalesData() {
   
    const { user, detail } = useAuth(); // Assuming useAuth() hook provides user and detail context


    const {    
        goalsTypeList, 
    } = useGoalsMD();

    const {
        productMap
      } = useFetchMD();

      const { 
        selectedAgentId, 
        selectedWorkerId,    
      } = useFetchAgentData();

      interface GoalsSuccessData {
        id: string;
        workerId: string;
        goalsTypeId: string;
        productGroup?: string;  // Include other fields you expect to be in the documents
      }

      const fetchGoalsSuccessForWorker = async (selectedAgentId: string, selectedWorkerId: string): Promise<GoalsSuccessData[]> => {
        const goalsSuccessRef = collection(db, 'goalsSuccess');
        const q = query(goalsSuccessRef, where('workerId', '==', selectedWorkerId), where('AgentId', '==', selectedAgentId));
        const querySnapshot = await getDocs(q);
      
        console.log(`Number of documents found: ${querySnapshot.docs.length}`);  // Log the number of documents fetched
        if (querySnapshot.empty) {
            console.log('No documents matched the query.');
        }
        return querySnapshot.docs.map(doc => ({
          ...doc.data() as GoalsSuccessData,  
          id: doc.id
        }));
      };

      const calculateTotalPremia = useCallback(async (selectedWorkerId: string, selectedAgentId: string) => {
        let totalPremia = 0;
        const goalsSuccess = await fetchGoalsSuccessForWorker(selectedAgentId, selectedWorkerId);
        console.log('goalsSuccess:', goalsSuccess);

        for (const goal of goalsSuccess) {
            const goalDetails = goalsTypeList.find(type => type.id === goal.goalsTypeId);
            console.log('Goal details:', goalDetails);
            if (!goalDetails) {
                console.error('Goal details not found for:', goal.goalsTypeId);
                continue;
            }

            const productsInGroup = Object.keys(productMap).filter(key => productMap[key] === goalDetails.productGroup);
            const salesQuery = query(collection(db, 'sales'), where('workerId', '==', selectedWorkerId), where('product', 'in', productsInGroup));
            const salesSnapshot = await getDocs(salesQuery);
            const totalForGoal = salesSnapshot.docs.reduce((sum, doc) => sum + (doc.data().premia || 0), 0);

            totalPremia += totalForGoal;
            console.log('ALL data ' + selectedWorkerId +' ' +selectedAgentId + ' '+ productsInGroup );
        }
        console.log(`Total premia for all goals: ${totalPremia}`);
        console.log('worker data ' + selectedWorkerId +' ' +selectedAgentId  );
        return totalPremia;
    }, [goalsTypeList, productMap]);


    return { calculateTotalPremia };
}

export default useCalculateSalesData;