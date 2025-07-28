

import { useEffect, useState, ChangeEvent  } from 'react';
import { query, collection, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { Lead, StatusLead } from '@/types/Enviorment';



const useFetchMD = (selectedAgentId?:string) => {



    const [companies, setCompanies] = useState<string[]>([]); 
    const [selectedCompany, setSelectedCompany] = useState<string>(''); 
  
    const [commissionTypes, setCommissionTypes] = useState<string[]>([]);
    const [selectedCommissionTypes, setSelectedCommissionTypes] = useState<string>(''); 

    const [selectedProductGroup, setSelectedProductGroup] = useState('');
    const [selectedProduct, setSelectedProduct] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [productGroupsDB, setProductGroupsDB] = useState<ProductGroup[]>([]);
    const [statusPolicies, setStatusPolicies] = useState<string[]>([]);
    const [selectedStatusPolicy, setSelectedStatusPolicy] =useState<string>('');
    const [selectedProductFilter, setSelectedProductFilter] = useState('');
    const [selectedProductGroupFilter, setSelectedProductGroupFilter] = useState('');
    const [selectedStatusPolicyFilter, setSelectedStatusPolicyFilter] = useState('');

    const [statusLeadMap, SetStatusLeadMap] = useState<any[]>([]);

    const [sourceLeadList, SetSourceLeadList] = useState<any[]>([]);
    const [sourceLeadMap, setSourceLeadMap] = useState<{ [key: string]: string }>({});



    interface ProductGroup {
      id: string;
      name: string;
    }
    

    type ProductGroupMap = {
      [key: string]: string; 
  };
        useEffect(() => {
          const fetchCompanies = async () => {
            const querySnapshot = await getDocs(collection(db, 'company'));
            const companiesList = querySnapshot.docs.map(doc => doc.data().companyName);
            setCompanies(companiesList);
          };
      
          fetchCompanies();
        }, []);
      

        useEffect(() => {
          const fetchCommissionTypes = async () => {
            const querySnapshot = await getDocs(collection(db, 'commissionType'));
            const commissionTypeList = querySnapshot.docs.map(doc => doc.data().commissionTypeName);
            setCommissionTypes(commissionTypeList);
          };
      
          fetchCommissionTypes();
        }, []);
        
      
        useEffect(() => {
          const fetchProductsGroupsFromMap = async () => {
            const querySnapshot = await getDocs(collection(db, 'productsGroup'));
            const groupsMap: ProductGroupMap = {}; 
        
            querySnapshot.forEach(doc => {
              const data = doc.data();
              groupsMap[doc.id] = data.productsGroupName as string; // כאן המיפוי הוא ממספר לשם
            });
        
            console.log("🔍 בדיקה productGroupMap:", groupsMap);
            setProductGroupMap(groupsMap);
          };
        
          fetchProductsGroupsFromMap();
        }, []);
        

        useEffect(() => {
          const fetchProductsGroupsFromDB = async () => {
            const querySnapshot = await getDocs(collection(db, 'productsGroup'));
            const groupsList: ProductGroup[] = querySnapshot.docs.map(doc => ({
              id: doc.id,
              name: doc.data().productsGroupName as string 
            }));
            setProductGroupsDB(groupsList);
          //  console.log('the PG is ' + productGroupsDB)
          };
        
          fetchProductsGroupsFromDB();
        }, []);





    const [productGroupMap, setProductGroupMap] = useState<ProductGroupMap>({});



      useEffect(() => {
        const fetchProducts = async () => {
          try {
         //   console.log("Attempting to fetch products");
            const querySnapshot = await getDocs(collection(db, 'product'));
            const productsList = querySnapshot.docs.map(doc => ({
              id: doc.id,
              name: doc.data().productName,
              productGroup: doc.data().productGroup
            }));
            setProducts(productsList);
        //    console.log("Products fetched:", productsList);
          } catch (error) {
            console.error("Failed to fetch products:", error);
          }
        };
      
        fetchProducts();
      }, [selectedProduct]);

      interface ProductMap {
        [productName: string]: string; // Assuming productGroup is a string
      }
      const [productMap, setProductMap] = useState<ProductMap>({});
      const [isLoading, setIsLoading] = useState(true);

    
      // useEffect(() => {
      //   const fetchProductsMap = async () => {
      //     setIsLoading(true);
      //     try {
      //       const querySnapshot = await getDocs(collection(db, 'product'));
      //       const productMap: ProductMap = {};
      //       querySnapshot.forEach(doc => {
      //         const data = doc.data();
      //         productMap[data.productName] = data.productGroup; 
      //       });
      //       setProductMap(productMap);
      //     } catch (error) {
      //       console.error("Failed to fetch products:", error);
      //     } finally {
      //       setIsLoading(false);
      //     }
      //   };
      
      //   fetchProductsMap();
      // }, []);
// /// is needed??? **************
//       useEffect(() => {
//         const fetchProductsMap = async () => {
//           setIsLoading(true);
//           try {
//             const querySnapshot = await getDocs(collection(db, "product"));
//             const productMap: ProductMap = {};
//             const productGroupMap: ProductGroupMap = {}; // ✅ נוסיף גם את המפה לקבוצות
      
//             querySnapshot.forEach((doc) => {
//               const data = doc.data();
//               productMap[data.productName] = data.productGroup; 
//               // if (data.productGroup) {
//               //   productGroupMap[data.productName] = data.productGroup; // ✅ נוסיף את הקבוצה
//               // }
//             });
//             console.log("📌 Fetched Product Group Map:", productGroupMap); // 🔍 בדיקה בקונסול
//             setProductMap(productMap);
//             // setProductGroupMap(productGroupMap); // ✅ שמירת קבוצות המוצרים
      
//           } catch (error) {
//             console.error("Failed to fetch products:", error);
//           } finally {
//             setIsLoading(false);
//           }
//         };
      
//         fetchProductsMap();
//       }, []);


type ProductToGroupMap = {
  [productName: string]: string; // שם מוצר → ID של קבוצת מוצר
};


const [productToGroupMap, setProductToGroupMap] = useState<ProductToGroupMap>({});

useEffect(() => {
  const fetchProductsMap = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "product"));

      const productMap: ProductMap = {}; // מפה של מוצר -> ID קבוצת מוצר
      const productToGroupMap: ProductToGroupMap = {}; // מפה של מוצר -> ID קבוצת מוצר (עם הטיפוס הנכון)

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        console.log("🛠 Fetching product:", data);

        // שמירת המוצר עם ה-ID של קבוצת המוצר
        if (data.productName && data.productGroup) {
          productMap[data.productName.trim()] = data.productGroup;
          productToGroupMap[data.productName.trim()] = data.productGroup; // ✅ עדכון המפה עם טיפוס נכון
        }
      });

      console.log("📌 Final productToGroupMap:", productToGroupMap);

      // שמירת הנתונים בסטייט
      setProductMap(productMap);
      setProductToGroupMap(productToGroupMap);

    } catch (error) {
      console.error("❌ Failed to fetch products:", error);
    } finally {
      setIsLoading(false);
    }
  };

  fetchProductsMap();
}, []);







      interface Product {
        id: string;
        name: string;
        productGroup: string;
      }
      
      useEffect(() => {
        const selectedProd = products.find(product => product.name === selectedProduct);
        if (selectedProd) {
          setSelectedProductGroup(selectedProd.productGroup);
        }
    //    console.log("Selected Product Group:", selectedProductGroup);
      
      }, [selectedProduct, products]); // Ensure this effect runs whenever selectedProduct or products change
      

 useEffect(() => {
    const fetchStatusPolicies = async () => {
      const activeStatusQuery = query(collection(db, 'statusPolicy'), where('isActive', '==', '1'));
      const querySnapshot = await getDocs(activeStatusQuery);
    //  const querySnapshot = await getDocs(collection(db, 'statusPolicy'));
      const statusList = querySnapshot.docs.map(doc => doc.data().statusName); // Assuming the field name is 'productName'
      setStatusPolicies(statusList);
    };
    fetchStatusPolicies();
  }, []);
  


  const fetchStatusLeadForAgentAndDefault = async (selectedAgentId?: string): Promise<StatusLead[]> => {
    try {
        const agentQuery = query(
            collection(db, 'statusLeadList'),
            where('AgentId', '==', selectedAgentId),
            where('statusLeadList', '==', true)
        );
        const agentQuerySnapshot = await getDocs(agentQuery);

        const defaultQuery = query(
            collection(db, 'statusLeadList'),
            where('defaultStatusLead', '==', true),
            where('statusLeadList', '==', true)
        );
        const defaultQuerySnapshot = await getDocs(defaultQuery);

        const agentStatuses = agentQuerySnapshot.docs.map(doc => ({
          id: doc.id, // מזהה מסמך קיים בכל מסמך
          ...doc.data(),
        }));
        
        const defaultStatuses = defaultQuerySnapshot.docs.map(doc => ({
          id: doc.id, // מזהה מסמך קיים בכל מסמך
          ...doc.data(),
        }));

        const allStatuses = [...agentStatuses, ...defaultStatuses];

        // הסרת כפילויות לפי ID
        const uniqueStatuses = Array.from(
            new Map(allStatuses.map(item => [item.id, item])).values()
        );
      SetStatusLeadMap(uniqueStatuses); // Set the combined unique statuses

        console.log("✅ Fetched Status Leads:", uniqueStatuses);

        return uniqueStatuses as StatusLead[];
    } catch (error) {
        console.error('❌ Error fetching status leads:', error);
        return [];
    }
};

  
 
useEffect(() => {
  if (selectedAgentId) {
      fetchSourceLeadForAgent(selectedAgentId);
      fetchStatusLeadForAgentAndDefault(selectedAgentId);
  }
}, [selectedAgentId]); 



// const fetchSourceLeadForAgent = async (UserAgentId: string): Promise<Lead[]> => {
//   const q = query(
//     collection(db, 'sourceLead'), 
//     where('AgentId', '==', UserAgentId)
//   );
//   const querySnapshot = await getDocs(q);
//   const data = querySnapshot.docs.map(doc => ({
//     id: doc.id,
//     ...doc.data()
//   })) as Lead[];
//   SetSourceLeadList(data); // עדכון ה-state אם נדרש
//   return data; // החזרת הנתונים
// };
const fetchSourceLeadForAgent = async (UserAgentId: string): Promise<Lead[]> => {
  try {
    const q = query(collection(db, "sourceLead"), where("AgentId", "==", UserAgentId));
    const querySnapshot = await getDocs(q);

    // יצירת המערך של המסמכים עם ID
    const data = querySnapshot.docs.map((doc) => ({
      id: doc.id, // מזהה קיים תמיד
      ...doc.data(),
    })) as Lead[];

    console.log("✅ נתונים שהתקבלו:", data);
    SetSourceLeadList(data);
    return data;
  } catch (error) {
    console.error("❌ שגיאה בשליפת נתוני מקור ליד:", error);
    return [];
  }
};


  const fetchSourceLeadMap = async (agentId: string) => {
    try {
      const q = query(collection(db, "sourceLead"), where("AgentId", "==", agentId));
      const querySnapshot = await getDocs(q);
      const sourceMap = querySnapshot.docs.reduce((map, doc) => {
        map[doc.id] = doc.data().sourceLead || "Unknown Source";
        return map;
      }, {} as { [key: string]: string });
      setSourceLeadMap(sourceMap);
      console.log("Populated sourceLeadMap:", sourceMap); // Debugging
    } catch (error) {
      console.error("Error fetching source leads:", error);
    }
  };
  
  useEffect(() => {
    if (selectedAgentId) {
      fetchSourceLeadMap(selectedAgentId);
    }
  }, [selectedAgentId]);
  

  const formatIsraeliDateOnly = (dateString: string): string => {
    if (!dateString) return ""; // Handle empty or undefined dates
    const date = new Date(dateString); // Convert to Date object
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    };
    return new Intl.DateTimeFormat("he-IL", options).format(date); // Format to Israeli locale
  };


   return {

    companies,
    selectedCompany,
    setSelectedCompany,
    products,
    selectedProduct,
    setSelectedProduct,
    selectedProductGroup,
    setSelectedProductGroup,
    productGroupsDB,
    productGroupMap,
    setSelectedStatusPolicy, 
    selectedStatusPolicy, 
    statusPolicies,
    selectedProductFilter,
    setSelectedProductFilter,
    selectedProductGroupFilter,
    setSelectedProductGroupFilter,
    selectedStatusPolicyFilter, 
    setSelectedStatusPolicyFilter,
    productMap, isLoading,statusLeadMap,sourceLeadList,SetSourceLeadList,
    fetchSourceLeadForAgent,fetchStatusLeadForAgentAndDefault,
    formatIsraeliDateOnly,sourceLeadMap,fetchSourceLeadMap, productToGroupMap
    
    
  };
  
//add change 
};
  export default useFetchMD;