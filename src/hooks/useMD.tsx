

import { useEffect, useState, ChangeEvent  } from 'react';
import { query, collection, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';



const useFetchMD = () => {


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
        console.log('the PG is ' + productGroupsDB)
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
            console.log("Attempting to fetch products");
            const querySnapshot = await getDocs(collection(db, 'product'));
            const productsList = querySnapshot.docs.map(doc => ({
              id: doc.id,
              name: doc.data().productName,
              productGroup: doc.data().productGroup
            }));
            setProducts(productsList);
            console.log("Products fetched:", productsList);
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
        console.log("Selected Product Group:", selectedProductGroup);
      
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
    productMap, isLoading
  };
  
  
};
  export default useFetchMD;