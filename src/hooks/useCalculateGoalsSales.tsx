import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';
import useGoalsMD from "@/hooks/useGoalsMD";
import useFetchMD from "@/hooks/useMD";
import useFetchAgentData from "@/hooks/useFetchAgentData";

function useCalculateSalesData() {
    const { user, detail } = useAuth();
    const [goalData, setGoalData] = useState<GoalData[]>([]);

    const { goalsTypeList } = useGoalsMD();
    const { productMap } = useFetchMD();
    const { selectedAgentId, selectedWorkerId } = useFetchAgentData();

    interface GoalsSuccessData {
        id: string;
        workerId: string;
        goalsTypeId: string;
        productGroup?: string;
    }

    interface GoalData {
        promotionId: string;
        amaunt: number;
        totalPremia: GroupTotals;
    }

    type GroupTotals = {
        [key: string]: number;
    };

    type PremiaFieldsMap = {
        [key in '1' | '3' | '4']: string;
    };

    const premiaFieldsMap = useMemo<PremiaFieldsMap>(() => ({
        '1': 'pensiaPremia',
        '3': 'insPremia',
        '4': 'finansimPremia'
    }), []);

    const fetchGoalsSuccessForWorker = useCallback(async (agentId: string, workerId: string): Promise<GoalsSuccessData[]> => {
        const q = query(collection(db, 'goalsSuccess'), where('workerId', '==', workerId), where('AgentId', '==', agentId));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ ...doc.data() as GoalsSuccessData, id: doc.id }));
    }, []);

    const calculateTotalPremia = useCallback(async (workerId: string, agentId: string) => {
        let groupTotals: GroupTotals = {};
        const goalsSuccess = await fetchGoalsSuccessForWorker(agentId, workerId);

        for (const goal of goalsSuccess) {
            const goalDetails = goalsTypeList.find(type => type.id === goal.goalsTypeId);
            if (!goalDetails) continue;

            const premiaField = premiaFieldsMap[goalDetails.productGroup as keyof PremiaFieldsMap];
            if (!premiaField) continue;

            const productsInGroup = Object.keys(productMap).filter(key => productMap[key] === goalDetails.productGroup);
            const salesQuery = query(collection(db, 'sales'), where('workerId', '==', workerId), where('product', 'in', productsInGroup));
            const salesSnapshot = await getDocs(salesQuery);

            groupTotals[goalDetails.productGroup] = (groupTotals[goalDetails.productGroup] || 0) +
                salesSnapshot.docs.reduce((sum, doc) => sum + parseFloat(doc.data()[premiaField] || 0), 0);
        }

        return groupTotals;
    }, [goalsTypeList, productMap, premiaFieldsMap]);

    const fetchDataGoalsForWorker = useCallback(async (selectedWorkerId: string, selectedAgentId: string) => {
      if (!selectedAgentId || !selectedWorkerId) {
          console.log('Agent ID or Worker ID is not defined');
          return;
      }
      const salesQuery = query(collection(db, 'goalsSuccess'),
          where('AgentId', '==', selectedAgentId),
          where('workerId', '==', selectedWorkerId)
      );
      const querySnapshot = await getDocs(salesQuery);
      const data = await Promise.all(querySnapshot.docs.map(async (doc) => {
          const { promotionId, amaunt } = doc.data() as { promotionId: string, amaunt: number };
          const totalPremia = await calculateTotalPremia(selectedWorkerId, selectedAgentId);
          return {
              promotionId,
              amaunt,
              totalPremia
          };
      }));
      setGoalData(data);
  }, [selectedAgentId, selectedWorkerId, calculateTotalPremia, setGoalData]);

  return { goalData, calculateTotalPremia, fetchDataGoalsForWorker };
}

export default useCalculateSalesData;