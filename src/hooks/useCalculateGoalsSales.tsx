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

    const { goalsTypeList, goalsTypeMap } = useGoalsMD();
    const { productMap } = useFetchMD();
    const { selectedAgentId, selectedWorkerId } = useFetchAgentData();

    interface GoalType {
        id: string;
        name: string;
        productGroup: string;
    }
    
    type GoalsTypeList = GoalType[];
    
    type ProductMap = {
        [productName: string]: string; // Mapping product names to product groups
    };
    
    type PremiaFieldsMap = {
        [productGroup: string]: string; // Mapping product groups to their respective premia fields
    };



    interface GoalsSuccessData {
        id: string;
        workerId: string;
        goalsTypeId: string;
        productGroup?: string;
    }

    interface GoalData {
        promotionName: string;
        amaunt: number;
        goalTypeName: string;
        totalPremia: GroupTotals;

    }

    type GroupTotals = {
        [key: string]: number;
    };

    type PromotionNames = {
        [key: string]: string;
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


   
    const [promotionNames, setPromotionNames] = useState<PromotionNames>({});
    
    const fetchPromotions = useCallback(async () => {
        const querySnapshot = await getDocs(collection(db, 'promotion'));
        const promotions: PromotionNames = {}; // Declare promotions with the PromotionNames type
        querySnapshot.forEach(doc => {
            promotions[doc.id] = doc.data().promotionName;
        });
        setPromotionNames(promotions);
        console.log('Promotions:', promotions);
    }, []);
   
    useEffect(() => {
        fetchPromotions();
    }, [fetchPromotions]);



    const calculateTotalPremia = useCallback(
        async (agentId: string, promotionId: string, workerId?: string) => {
            const groupTotals: GroupTotals = {};
            console.log('promotionId:', promotionId);
    
            let goalQueryConditions = [
                where('AgentId', '==', agentId),
                where('promotionId', '==', promotionId)
            ];
            if (workerId) {
                goalQueryConditions.push(where('workerId', '==', workerId));
            }
            console.log('goalQueryConditions:', goalQueryConditions);
            const specificGoalQuery = query(collection(db, 'goalsSuccess'), ...goalQueryConditions);
            const goalSnapshot = await getDocs(specificGoalQuery);
    
            if (goalSnapshot.empty) {
                console.log('No goals found for the specified criteria');
                return groupTotals;
            }
    
            await Promise.all(goalSnapshot.docs.map(async (doc) => {
                const goalData = doc.data();
                const goalDetails = goalsTypeList.find(type => type.id === goalData.goalsTypeId);
    
                if (!goalDetails) {
                    console.error('Goal details not found for:', goalData.goalsTypeId);
                    return;
                }
    
                const premiaField = premiaFieldsMap[goalDetails.productGroup];
                if (!premiaField) {
                    console.error(`Premia field not defined for product group ${goalDetails.productGroup}`);
                    return;
                }
    
                const productsInGroup = Object.keys(productMap).filter(key => productMap[key] === goalDetails.productGroup);
                let salesQueryConditions = [
                    where('product', 'in', productsInGroup)
                ];
                if (workerId) {
                    salesQueryConditions.push(where('workerId', '==', workerId));
                }
                const salesQuery = query(collection(db, 'sales'), ...salesQueryConditions);
                const salesSnapshot = await getDocs(salesQuery);
    
                const totalForGroup = salesSnapshot.docs.reduce((sum, doc) => sum + parseFloat(doc.data()[premiaField] || 0), 0);
                groupTotals[goalDetails.productGroup] = (groupTotals[goalDetails.productGroup] || 0) + totalForGroup;
            }));
    
            console.log(`Total premia for specified criteria: ${JSON.stringify(groupTotals)}`);
            return groupTotals;
        },
        [goalsTypeList, productMap, premiaFieldsMap] 
    );


      const fetchDataGoalsForWorker = useCallback(async (selectedAgentId: string, selectedWorkerId?: string) => {
        if (!selectedAgentId || !selectedWorkerId) {
            console.log('Agent ID or Worker ID is not defined');
            return;
        }

        let salesQuery = query(collection(db, 'goalsSuccess'), where('AgentId', '==', selectedAgentId));
                if (selectedWorkerId) {
            salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerId));
        }
        const querySnapshot = await getDocs(salesQuery);
        const data = await Promise.all(querySnapshot.docs.map(async (doc) => {
            const { promotionId, amaunt, goalsTypeId } = doc.data() as { promotionId: string, amaunt: number, goalsTypeId: string };
            const totalPremia = await calculateTotalPremia( selectedAgentId, promotionId, selectedWorkerId);
            const promotionName = promotionNames[promotionId] || 'Unknown Promotion'; // Use the promotion name or 'Unknown' if not found
            const goalTypeName = goalsTypeMap[goalsTypeId] || 'Unknown Goal Type';  // Retrieve goal type name using goalsTypeId

            return {
                promotionName,
                amaunt,
                goalTypeName,
                totalPremia 
            };
        }));
        setGoalData(data);
    }, [selectedAgentId, selectedWorkerId, calculateTotalPremia, setGoalData]);






    

  return { goalData, calculateTotalPremia, fetchDataGoalsForWorker };
}

export default useCalculateSalesData;