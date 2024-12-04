

import { useEffect, useState, ChangeEvent  } from 'react';
import { query, collection, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';



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
    const [selectedStatusPolicy, setSelectedStatusPolicy] = useState('');
    const [selectedProductFilter, setSelectedProductFilter] = useState('');
    const [selectedProductGroupFilter, setSelectedProductGroupFilter] = useState('');
    const [selectedStatusPolicyFilter, setSelectedStatusPolicyFilter] = useState('');

    const [statusLeadMap, SetStatusLeadMap] = useState<any[]>([]);

    const [sourceLeadList, SetSourceLeadList] = useState<any[]>([]);



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
      const fetchProductsGroupsFromDB = async () => {
        const querySnapshot = await getDocs(collection(db, 'productsGroup'));
        const groupsMap: ProductGroupMap = {}; 
        querySnapshot.forEach(doc => {
          const data = doc.data();
          groupsMap[doc.id] = data.productsGroupName as string; // Ensure you cast or ensure the type here if necessary
        });
        setProductGroupMap(groupsMap);
      };
    
      fetchProductsGroupsFromDB();
    }, []);



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

    
      useEffect(() => {
        const fetchProductsMap = async () => {
          setIsLoading(true);
          try {
            const querySnapshot = await getDocs(collection(db, 'product'));
            const productMap: ProductMap = {};
            querySnapshot.forEach(doc => {
              const data = doc.data();
              productMap[data.productName] = data.productGroup; 
            });
            setProductMap(productMap);
          } catch (error) {
            console.error("Failed to fetch products:", error);
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


  const fetchStatusLeadForAgentAndDefault = async (selectedAgentId?: string) => {
    try {
      // Query 1: Fetch statuses specific to the agent where `statusLeadList = true`
     
      const agentQuery = query(
        collection(db, 'statusLeadList'),
        where('AgentId', '==', selectedAgentId),
        where('statusLeadList', '==', true)
      );
      const agentQuerySnapshot = await getDocs(agentQuery);
    
      // Query 2: Fetch default statuses where `defaultStatusLead = true` and `statusLeadList = true`
      const defaultQuery = query(
        collection(db, 'statusLeadList'),
        where('defaultStatusLead', '==', true),
        where('statusLeadList', '==', true)
      );
      const defaultQuerySnapshot = await getDocs(defaultQuery);
      // Extract data from both queries
      const agentStatuses = agentQuerySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
  
      const defaultStatuses = defaultQuerySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
  
      // Combine the results and remove duplicates
      const allStatuses = [...agentStatuses, ...defaultStatuses];
      const uniqueStatuses = Array.from(
        new Map(allStatuses.map(item => [item.id, item])).values()
      );
  
      SetStatusLeadMap(uniqueStatuses); // Set the combined unique statuses
      console.log('SetStatusLeadMap:', uniqueStatuses);
    } catch (error) {
      console.error('Error fetching status leads:', error);
    }
  };

  
 
useEffect(() => {
  if (selectedAgentId) {
      fetchSourceLeadForAgent(selectedAgentId);
      fetchStatusLeadForAgentAndDefault(selectedAgentId);
  }
}, [selectedAgentId]); 




const fetchSourceLeadForAgent = async (UserAgentId: string) => {
  const q = query(
    collection(db, 'sourceLead'), 
    where('AgentId', '==', selectedAgentId)
  );
  const querySnapshot = await getDocs(q);
  const data = querySnapshot.docs.map(doc => ({
      id: doc.id, 
      ...doc.data() 
    }));
    SetSourceLeadList(data);
    console.log('SetSourceLeadList '+ SetSourceLeadList)
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
    fetchSourceLeadForAgent,fetchStatusLeadForAgentAndDefault
    
    
  };
  
  
};
  export default useFetchMD;