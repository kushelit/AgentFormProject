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
    const { selectedAgentId, selectedWorkerIdFilter } = useFetchAgentData();


    type ProductMap = {
        [productName: string]: string; // Mapping product names to product groups
    };
    
    type PremiaFieldsMap = {
        [productGroup: string]: string; // Mapping product groups to their respective premia fields
    };



    interface GoalData {
        promotionName: string;
        amaunt: number;
        goalTypeName: string;
        totalPremia: GroupTotals | ExtendedGroupTotals;  // Use a union type here
        totalStars?: number;
    }
    type ExtendedGroupTotals = {
        totals: GroupTotals;
        totalStars: number;
    };



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
        async (agentId: string, promotionId: string, workerId: string) => {
            const groupTotals: GroupTotals = {};
            let totalStars = 0; // Initialize totalStars to 0
    
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
                return { totals: groupTotals, totalStars }; // Ensure to return both totals and stars
            }
    
            await Promise.all(goalSnapshot.docs.map(async (doc) => {
                const goalData = doc.data();
                const goalDetails = goalsTypeList.find(type => type.id === goalData.goalsTypeId);
    
                if (!goalDetails) {
                    console.error('Goal details not found for:', goalData.goalsTypeId);
                    return;
                }
                if (goalDetails.id === '4') {
                    const { totals, totalStarsInsideFunc: totalStars } = await calculateTypeFourPremia(agentId, promotionId, workerId);
                    console.log(`Total stars for type '4':`, totalStars); // Now correctly referencing the stars count
                    // Assuming you need to do something with `totals` or just want to exit
                    return;
                }
    
                const premiaField = premiaFieldsMap[goalDetails.productGroup];
                if (!premiaField) {
                    console.error(`Premia field not defined for product group ${goalDetails.productGroup}`);
                    return;
                }
                const productsInGroup = Object.keys(productMap).filter(key => productMap[key] === goalDetails.productGroup);
                let salesQuery = query(collection(db, 'sales'), where('product', 'in', productsInGroup));
                if (workerId) {
                    salesQuery = query(salesQuery, where('workerId', '==', workerId)); // Fixed redundant query call
                }
                const salesSnapshot = await getDocs(salesQuery);
                const totalForGroup = salesSnapshot.docs.reduce((sum, doc) => sum + parseFloat(doc.data()[premiaField] || 0), 0);
                groupTotals[goalDetails.productGroup] = (groupTotals[goalDetails.productGroup] || 0) + totalForGroup;
            }));
    
            console.log(`Total premia for specified criteria: ${JSON.stringify(groupTotals)}`);
            console.log(`Total stars accumulated: ${totalStars}`);
            return { totals: groupTotals, totalStars }; // Return both totals and stars for all types
        },
        [goalsTypeList, productMap, premiaFieldsMap] 
    );
    
   

    const fetchDataGoalsForWorker = useCallback(async (selectedAgentId: string, selectedWorkerIdFilter?: string) => {
        if (!selectedAgentId || !selectedWorkerIdFilter) {
            console.log('Agent ID or Worker ID is not defined');
            return;
        }
    
        let salesQuery = query(collection(db, 'goalsSuccess'), where('AgentId', '==', selectedAgentId));
        if (selectedWorkerIdFilter) {
            salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerIdFilter));
        }
        const querySnapshot = await getDocs(salesQuery);
        const data = await Promise.all(querySnapshot.docs.map(async (doc) => {
            const { promotionId, amaunt, goalsTypeId } = doc.data() as { promotionId: string, amaunt: number, goalsTypeId: string };
            const totalPremiaResults = await calculateTotalPremia(selectedAgentId, promotionId, selectedWorkerIdFilter);
            const promotionName = promotionNames[promotionId] || 'Unknown Promotion';
            const goalTypeName = goalsTypeMap[goalsTypeId] || 'Unknown Goal Type';
    
            return {
                promotionName,
                amaunt,
                goalTypeName: goalsTypeMap[goalsTypeId], // Assuming this maps to 'כוכבים' for type '4'
                totalPremia: {
                    totals: totalPremiaResults.totals, // Assuming totals is a part of the return from calculateTotalPremia
                    totalStars: totalPremiaResults.totalStars // Adjust this to use the correct property name
                },
                totalStars: totalPremiaResults.totalStars // Optionally at the top level if required
            };
        }));
        setGoalData(data);
    }, [selectedAgentId, selectedWorkerIdFilter, calculateTotalPremia, setGoalData]);

    

    const calculateTypeFourPremia = async (agentId: string, promotionId: string, workerId: string) => {
        console.log('Executing calculateTypeFourPremia:');
        console.log('Parameters:', agentId, promotionId, workerId);
    
        let totalStarsInsideFunc = 0;  // Initialize total stars to zero
        const typeOneGroupTotals: GroupTotals = {};  // This will store the stars per group
    
        // Query to get star settings for this promotion and agent
        const starQuery = query(
            collection(db, 'stars'),
            where('promotionId', '==', promotionId),
            where('AgentId', '==', agentId)
        );
    
        const starSnapshot = await getDocs(starQuery);
        if (starSnapshot.empty) {
            console.log('No star data found for the specified criteria');
            return { totals: {}, totalStarsInsideFunc };  // No data found, return zeros
        }
    
        // Assuming there's at least one document
        const starData = starSnapshot.docs[0].data();
        console.log('Star Data:', starData);
    
        // Define the fields that correspond to each group's star rating
        const fields = {
            '1': 'pensiaStar',
            '3': 'insuranceStar',
            '4': 'finansimStar'
        };
    
        // Calculate stars for each group
        for (const [group, field] of Object.entries(fields)) {
            const premiaField = premiaFieldsMap[group];
            if (!premiaField) {
                console.error(`Premia field not defined for product group ${group}`);
                continue;  // Skip this group if no mapping is found
            }
    
            const productsInGroup = Object.keys(productMap).filter(key => productMap[key] === group);
            const salesQuery = query(collection(db, 'sales'), where('product', 'in', productsInGroup), where('workerId', '==', workerId));
            const salesSnapshot = await getDocs(salesQuery);
            const totalPremia = salesSnapshot.docs.reduce((sum, doc) => sum + parseFloat(doc.data()[premiaField] || 0), 0);
    
            console.log(`Total Premia for group ${group}:`, totalPremia);
            const starValue = parseFloat(starData[field] || 0);
            const starsEarned = starValue ? Math.floor(totalPremia / starValue) : 0;
    
            console.log(`Stars earned for group ${group}:`, starsEarned);
            typeOneGroupTotals[group] = starsEarned;
            totalStarsInsideFunc += starsEarned;  // Accumulate total stars
        }
    
        console.log(`Total stars earned across all groups: ${totalStarsInsideFunc}`);
        return {
            totals: typeOneGroupTotals,
            totalStars: totalStarsInsideFunc
        };  // Return both group totals and overall stars
    };
    

  return { goalData, calculateTotalPremia, fetchDataGoalsForWorker };
}

export default useCalculateSalesData;