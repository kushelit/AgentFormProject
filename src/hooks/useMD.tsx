

import { useEffect, useState, ChangeEvent  } from 'react';
import { query, collection, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';



const useFetchMD = () => {

   // const [productGroupsDB, setProductGroupsDB] = useState<string[]>([]);
   // const [selectedProductGroup, setSelectedProductGroup] = useState<string>(''); // Also type the selectedCompany as string

    const [companies, setCompanies] = useState<string[]>([]); 
    const [selectedCompany, setSelectedCompany] = useState<string>(''); // Also type the selectedCompany as string
   // const [products, setProducts] = useState<string[]>([]);
  //  const [selectedProduct, setSelectedProduct] = useState<string>(''); // Also type the selectedCompany as string

    const [commissionTypes, setCommissionTypes] = useState<string[]>([]);
    const [selectedCommissionTypes, setSelectedCommissionTypes] = useState<string>(''); // Also type the selectedCompany as string

    const [selectedProductGroup, setSelectedProductGroup] = useState('');
    const [selectedProduct, setSelectedProduct] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [productGroupsDB, setProductGroupsDB] = useState<ProductGroup[]>([]);
    const [statusPolicies, setStatusPolicies] = useState<string[]>([]);
    const [selectedStatusPolicy, setSelectedStatusPolicy] = useState('');
    const [selectedProductFilter, setSelectedProductFilter] = useState('');
    const [selectedStatusPolicyFilter, setSelectedStatusPolicyFilter] = useState('');


    interface ProductGroup {
      id: string;
      name: string;
    }
    

    type ProductGroupMap = {
      [key: string]: string; // Key is the product group ID, value is the product group name
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
          name: doc.data().productsGroupName as string // Cast to string if you are sure about the type
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
        const groupsMap: ProductGroupMap = {}; // Use the defined type here
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
      const querySnapshot = await getDocs(collection(db, 'statusPolicy'));
      const statusList = querySnapshot.docs.map(doc => doc.data().statusName); // Assuming the field name is 'productName'
      setStatusPolicies(statusList);
    };
    fetchStatusPolicies();
  }, []);

      
   return {

    companies,
    selectedCompany,
    setSelectedCompany,
  //  productGroups, old
 //   selectedProductGroup, old 
 //   setSelectedProductGroup, old
     // products,  old
 //    setSelectedProduct, old
 //    selectedProduct, old
    //commissionTypes,
   // setSelectedCommissionTypes,
   // selectedCommissionTypes
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
    selectedStatusPolicyFilter, 
    setSelectedStatusPolicyFilter
  };
  
  
};
  export default useFetchMD;