import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';
import useGoalsMD from "@/hooks/useGoalsMD";
import useFetchMD from "@/hooks/useMD";
import useFetchAgentData from "@/hooks/useFetchAgentData";

import { Timestamp } from 'firebase/firestore';



function useCalculateSalesData() {
    const { user, detail } = useAuth();
    const [goalData, setGoalData] = useState<GoalData[]>([]);

    const { goalsTypeList, goalsTypeMap } = useGoalsMD();
    const { productMap } = useFetchMD();
    const { selectedAgentId, selectedWorkerIdFilter } = useFetchAgentData();
    const [promotionDetails, setPromotionDetails] = useState<PromotionDetails>({});
    
    const [promotionNames, setPromotionNames] = useState<PromotionNames>({});


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
        achievementRate?: number;
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
        '4': 'finansimZvira'
    }), []);

    type PromotionDetails = {
        [key: string]: {
            name: string;
            startDate: Date;
            endDate: Date;
        };
    };

    
    const fetchPromotions = useCallback(async () => {
        const querySnapshot = await getDocs(collection(db, 'promotion'));
        const promotions: PromotionDetails = {}; // Correctly typed now
        querySnapshot.forEach(doc => {
            const data = doc.data();
            promotions[doc.id] = {
                name: data.promotionName,
                startDate: data.promotionStartDate,
                endDate: data.promotionEndDate
            };
        });
        console.log('startDate:', promotions);
        setPromotionDetails(promotions); // Correctly named function to set state
        console.log('Promotions:', promotions);
    }, []);


    useEffect(() => {
        fetchPromotions();
    }, [fetchPromotions]);


    const calculateTotalPremia = useCallback(
        async (agentId: string, promotionId: string, workerId: string, docId: string): Promise<{ totals: GroupTotals; totalStars: number; productGroup?: string }> => {
            const groupTotals: GroupTotals = {};
            let totalStars = 0; // Initialize totalStars to 0
            let productGroup : string | undefined;

            const promotion = promotionDetails[promotionId];
            if (!promotion) {
                console.error('Promotion details not found for:', promotionId);
                return { totals: groupTotals, totalStars };
            }
    
      //      let goalQueryConditions = [
       //         where('AgentId', '==', agentId),
        //        where('promotionId', '==', promotionId),
        //    ];
       //     if (workerId) {
       //         goalQueryConditions.push(where('workerId', '==', workerId));
       //     }
//     console.log('goalQueryConditions:', goalQueryConditions);
          //  const specificGoalQuery = query(collection(db, 'goalsSuccess'), ...goalQueryConditions);
         //   const goalSnapshot = await getDocs(specificGoalQuery);
    
        //    if (goalSnapshot.empty) {
        //        console.log('No goals found for the specified criteria');
       //         return { totals: groupTotals, totalStars }; // Ensure to return both totals and stars
       //     }
    
       //     await Promise.all(goalSnapshot.docs.map(async (doc) => {
        //        const goalData = doc.data();
        //        const goalDetails = goalsTypeList.find(type => type.id === goalData.goalsTypeId);
            
   //             if (!goalDetails) {
   //                 console.error('Goal details not found for:', goalData.goalsTypeId);
   //                 return;  // Skip this iteration by returning early from the async function
   //             }
             // Assuming docId is the Firestore document ID for direct document retrieval

             // new **
        const docRef = doc(db, 'goalsSuccess', docId);
        const docSnapshot = await getDoc(docRef);
        if (!docSnapshot.exists()) {
            console.log('No goals found for the specified docId');
            return { totals: groupTotals, totalStars };
        }
        const goalData = docSnapshot.data();
        const goalDetails = goalsTypeList.find(type => type.id === goalData.goalsTypeId);

        if (!goalDetails) {
            console.error('Goal details not found for:', goalData.goalsTypeId);
            return { totals: groupTotals, totalStars };
        }

// new **
                if (goalDetails.id === '4') {
                    const { totals, totalStarsInsideFunc } = await calculateTypeFourPremia(agentId, promotionId, workerId,promotionDetails);
                    console.log(`Total stars for type '4':`, totalStarsInsideFunc);
                    totalStars += totalStarsInsideFunc; // Accumulate stars earned from type '4'
                    Object.assign(groupTotals, totals); // Merge type '4' totals with existing groupTotals
                //    return; // Exit this iteration early
                }
    
                const premiaField = premiaFieldsMap[goalDetails.productGroup];
                if (!premiaField) {
                    console.error(`Premia field not defined for product group ${goalDetails.productGroup}`);
                    return { totals: groupTotals, totalStars, productGroup }; // Still return an object matching the type
                }
                const productsInGroup = Object.keys(productMap).filter(key => productMap[key] === goalDetails.productGroup);
                
                let salesQuery = query(collection(db, 'sales'), where
                ('product', 'in', productsInGroup),
                where('mounth', '>=', promotion.startDate),
                where('mounth', '<=', promotion.endDate)
            
            );
                if (workerId) {
                    salesQuery = query(salesQuery, where('workerId', '==', workerId));
                }
                const salesSnapshot = await getDocs(salesQuery);
                const totalForGroup = salesSnapshot.docs.reduce((sum, doc) => sum + parseFloat(doc.data()[premiaField] || 0), 0);
                console.log(`Total for groupppp ${goalDetails.productGroup}:`, totalForGroup);

                groupTotals[goalDetails.productGroup] = (groupTotals[goalDetails.productGroup] || 0) + totalForGroup;
                console.log(`Total for groupppbbb ${goalDetails.productGroup}:`, totalForGroup);

                 productGroup = goalDetails.productGroup; // Set productGroup based on goalDetails

         //   }));
    
            console.log(`Total premia for specified criteria: ${JSON.stringify(groupTotals)}`);
            console.log(`Total stars accumulated: ${totalStars}`);

            console.log(`Final groupTotals: ${JSON.stringify(groupTotals)}`);

            return { totals: groupTotals, totalStars,productGroup  }; // Return the accumulated totals and stars
        },
        [goalsTypeList, productMap, premiaFieldsMap, promotionDetails] 
    );



    
    const fetchDataGoalsForWorker = useCallback(async (selectedAgentId: string, selectedWorkerIdFilter?: string) => {
       console.log('Executing fetchDataGoalsForWorker:');
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
            const docId = doc.id; // This is the unique identifier for the goal

            const totalPremiaResults = await calculateTotalPremia(selectedAgentId, promotionId, selectedWorkerIdFilter, docId);
            console.log('Total Premia Results in fetch:', totalPremiaResults); // Log the results for debugging
            const promotionName = promotionDetails[promotionId]?.name || 'Unknown Promotion';

          //  const promotionName = promotionNames[promotionId] || 'Unknown Promotion';
            const goalTypeName = goalsTypeMap[goalsTypeId] || 'Unknown Goal Type';
     

  // Determine target values from the goal data
  const targetGoal = amaunt; // Use amaunt from goalsSuccess as the target goal
  const totalStars = totalPremiaResults.totalStars || 0; // Total stars from calculations
  const totalPremia = totalPremiaResults.productGroup
  ? totalPremiaResults.totals[totalPremiaResults.productGroup] || 0
  : 0;
  console.log('gtotalPremiaResults goalsTypeId:', goalsTypeId);
  // Debugging output
  console.log(`Target Goal: ${targetGoal}, Total Stars: ${totalStars}, Total Premia: ${totalPremia}`);



  // Calculate the achievement rate (עמידה ביעד)
       const achievementRate = goalTypeName === "כוכבים" 
      ? (totalStars > 0 ? (totalStars / targetGoal) * 100 : 0) // Calculate based on stars
      : (totalPremia > 0 ? (totalPremia / targetGoal) * 100 : 0); // Calculate based on premia


            return {
                promotionName,
                amaunt,
                goalTypeName: goalsTypeMap[goalsTypeId],
                totalPremia: totalPremiaResults.totals,
                totalStars: totalPremiaResults.totalStars ,// Capture totalStars here
                achievementRate // Include the calculated achievement rate

            };
        }));
        setGoalData(data);
    }, [selectedAgentId, selectedWorkerIdFilter, calculateTotalPremia, setGoalData, promotionNames, goalsTypeMap]);

    

    const calculateTypeFourPremia = async (agentId: string, promotionId: string, workerId: string, promotionDetails : PromotionDetails) => {
        console.log('Executing calculateTypeFourPremia:');
        console.log('Parameters:', agentId, promotionId, workerId);
    
 // Access the promotion period from promotionDetails
 const promotion = promotionDetails[promotionId];
 if (!promotion) {
     console.error('Promotion details not found for:', promotionId);
     return { totals: {}, totalStarsInsideFunc: 0 };
 }

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
            console.log('Current group:', group); // Check what 'group' is currently processed

            const premiaField = premiaFieldsMap[group];
            console.log('Premia Field for group', group, ':', premiaField); // Check mapping result
            if (!premiaField) {
                console.error(`Premia field not defined for product group ${group}`);
                continue;  // Skip this group if no mapping is found
            }
    
            const productsInGroup = Object.keys(productMap).filter(key => productMap[key] === group);
          
    
          
    console.log('Promotion Start Date:', promotion.startDate);
    console.log('Promotion End Date:', promotion.endDate);
  
            const salesQuery = query(collection(db, 'sales'),
            where('product', 'in', productsInGroup),
            where('mounth', '>=', promotion.startDate),
            where('mounth', '<=', promotion.endDate),
            where('workerId', '==', workerId));
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
        return  { totals: typeOneGroupTotals, totalStarsInsideFunc };
    };
    

  return { goalData,setGoalData, calculateTotalPremia, fetchDataGoalsForWorker };
}

export default useCalculateSalesData;