import { ChangeEventHandler, FormEventHandler, useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import useFetchMD from "@/hooks/useMD"; 
import './ManageContracts.css';


  const ManageContracts: React.FC = () => {
  const { user, detail } = useAuth();
  const [defaultContracts, setDefaultContracts] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);

  const [commissionPercentHekef1, setCommissionPercentHekef1] = useState('');
  const [commissionPercentNifraim1, setCommissionPercentNifraim1] = useState('');
  const [commissionPercentNiud1, setCommissionPercentNiud1] = useState('');

  
  const [commissionPercentHekef2, setCommissionPercentHekef2] = useState('');
  const [commissionPercentNifraim2, setCommissionPercentNifraim2] = useState('');
  const [commissionPercentNiud2, setCommissionPercentNiud2] = useState('');


  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState(null);

  const [isEditing1, setIsEditing1] = useState(false);
  const [isEditing2, setIsEditing2] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  //const [date, setDate] = useState('');

  const {
    companies, 
    selectedCompany, 
    setSelectedCompany,
    products,
    setSelectedProduct,
    selectedProduct,
    //productGroups, old
    productGroupsDB, //new
    selectedProductGroup,
    setSelectedProductGroup,
    productGroupMap,
  
  } = useFetchMD();




  const handlecommissionPercentHekef1: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    // Allow numbers and one dot for decimal places
    const onlyNumsAndDot = value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
    setCommissionPercentHekef1(onlyNumsAndDot);
};
const handlecommissionPercentNifraim1: ChangeEventHandler<HTMLInputElement> = (e) => {
  const value = e.target.value;
  const onlyNumsAndDot = value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
  setCommissionPercentNifraim1(onlyNumsAndDot);
};

const handlecommissionPercentNiud1: ChangeEventHandler<HTMLInputElement> = (e) => {
  const value = e.target.value;
  const onlyNumsAndDot = value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
  setCommissionPercentNiud1(onlyNumsAndDot);
};

const handlecommissionPercentHekef2: ChangeEventHandler<HTMLInputElement> = (e) => {
  const value = e.target.value;
  const onlyNumsAndDot = value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
  setCommissionPercentHekef2(onlyNumsAndDot);
};

const handlecommissionPercentNifraim2: ChangeEventHandler<HTMLInputElement> = (e) => {
const value = e.target.value;
const onlyNumsAndDot = value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
setCommissionPercentNifraim2(onlyNumsAndDot);
};

const handlecommissionPercentNiud2: ChangeEventHandler<HTMLInputElement> = (e) => {
  const value = e.target.value;
  const onlyNumsAndDot = value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
  setCommissionPercentNiud2(onlyNumsAndDot);
  };
  
const resetFormDefault = () => {
  setSelectedProductGroup('');
  setCommissionPercentHekef1('');
  setCommissionPercentNifraim1('');
  setCommissionPercentNiud1('');
  setIsEditing1(false);
  setSelectedRow(null); 

};

const resetFormContracts = () => {
  setSelectedCompany('');
  setSelectedProduct('');
  setCommissionPercentHekef2('');
  setCommissionPercentNifraim2('');
  setCommissionPercentNiud2('');
  setIsEditing2(false);
  setSelectedRow(null); 

};

const canSubmit1 = useMemo(() => (
  selectedProductGroup.trim() !== '' &&
  commissionPercentHekef1.trim() !== '' &&
  commissionPercentNifraim1.trim() !== '' &&
  commissionPercentNiud1.trim() !== '' 
), [selectedProductGroup, commissionPercentHekef1, commissionPercentNifraim1, commissionPercentNiud1 
 ]);



  const handleSubmitDiffultValue = async () => {
  //  event.preventDefault();
    try {
     
        if (!detail || !detail.agentId) return;

        const existingContractQuery = query(collection(db, 'contracts'), 
        where('AgentId', '==', detail.agentId),
        where('productsGroup', '==', selectedProductGroup)
      );
  
      const querySnapshot = await getDocs(existingContractQuery);
      if (!querySnapshot.empty) {
        console.log('A contract with the same details already exists.');
        alert('לא ניתן להזין הסכם זהה להסכם קיים'); 
        return; 
      }
        console.log("got here");
        const docRef = await addDoc(collection(db, 'contracts'), {
        AgentId: detail.agentId,
        company: '',
        productsGroup: selectedProductGroup,
        product: '',
        commissionHekef:commissionPercentHekef1,
        commissionNifraim:commissionPercentNifraim1,
        commissionNiud:commissionPercentNiud1
      });      
      console.log('Document written with ID:', docRef.id);
      resetFormDefault(); 
   //   if (selectedAgent) {
    console.log("got here");
    fetchdefaultContracts();
    //  }
    } catch (error) {
      console.error('Error adding document:', error);
    }
  };

  const canSubmit2 = useMemo(() => (
    selectedCompany.trim() !== '' &&
    selectedProduct.trim() !== '' &&
    commissionPercentHekef2.trim() !== '' &&
    commissionPercentNifraim2.trim() !== '' &&
    commissionPercentNiud2.trim() !== '' 
  ), [selectedCompany, selectedProduct, commissionPercentHekef2, commissionPercentNifraim2, 
    commissionPercentNiud2 
   ]);
  

  const handleSubmitFullValuesCommission = async () => {
    //  event.preventDefault();
      try {
       
          if (!detail || !detail.agentId) return;

       const existingContractQuery = query(collection(db, 'contracts'), 
      where('AgentId', '==', detail.agentId),
      where('company', '==', selectedCompany),
      where('product', '==', selectedProduct)
    );

    const querySnapshot = await getDocs(existingContractQuery);
    if (!querySnapshot.empty) {
      console.log('A contract with the same details already exists.');
      alert('לא ניתן להזין הסכם זהה להסכם קיים'); 
      return; 
    }
          console.log("got here");
          const docRef = await addDoc(collection(db, 'contracts'), {
          AgentId: detail.agentId,
          company: selectedCompany,
          productsGroup: '',
          product: selectedProduct,
          commissionHekef:commissionPercentHekef2,
          commissionNifraim:commissionPercentNifraim2,
          commissionNiud:commissionPercentNiud2
       
        });      
        console.log('Document written with ID:', docRef.id);
        resetFormContracts(); 
     //   setIsEditing(false);
     //   if (selectedAgent) {
      fetchContracts();
      //  }
      } catch (error) {
        console.error('Error adding document:', error);
      }
    };


    const fetchContracts = async () => {
      if (!detail || !detail.agentId) return;
      let q = query(
        collection(db, 'contracts'), 
        where('AgentId', '==', detail.agentId),
        where('productsGroup', '==', '')  // Adjust if necessary
      );
      if (selectedCompany.trim() !== '') {
        q = query(q, where('company', '==', selectedCompany));
      }
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id, 
        ...doc.data() 
      }));
      setContracts(data);
    };
  
    useEffect(() => {
      fetchContracts();
    }, [detail, selectedCompany]);  // Dependency array


  const fetchdefaultContracts = async () => {
    if (!detail || !detail.agentId) return;
    const diffContractsQuery = query(
        collection(db, 'contracts'),
        where('AgentId', '==', detail.agentId),       
        where('productsGroup', '!=', '')          
    );
    const querySnapshot = await getDocs(diffContractsQuery);
    const contractsList = querySnapshot.docs.map(doc => ({
      id: doc.id, 
        ...doc.data() 
    }));
    setDefaultContracts(contractsList );
  };

  useEffect(() => {
    fetchdefaultContracts();
  }, [detail]);  // Dependency array



  const handleRowClick = (item: any) => {
    setSelectedRow(item); // Store the selected row's data
    setSelectedProductGroup(item.productsGroup );  
    setCommissionPercentHekef1(item.commissionHekef);
    setCommissionPercentNifraim1(item.commissionNifraim);
    setCommissionPercentNiud1(item.commissionNiud);
    setIsEditing1(true);

console.log(item.commissionNifraim + '  ');
console.log(commissionPercentNifraim1);

};

const handleRowClick2 = (item: any) => {
  setSelectedRow(item); // Store the selected row's data
  setSelectedCompany(item.company ); 
  setSelectedProduct(item.product ); 
  setCommissionPercentHekef2(item.commissionHekef);
  setCommissionPercentNifraim2(item.commissionNifraim);
  setCommissionPercentNiud2(item.commissionNiud);
  setIsEditing2(true);

console.log(item.commissionNifraim + '  ');
console.log(commissionPercentNifraim1);

  };

  const handleDelete1 = async () => {
    if (selectedRow && selectedRow.id) {
      await deleteDoc(doc(db, 'contracts', selectedRow.id));
      setSelectedRow(null); // Reset selection
      resetFormDefault();
      console.log('defaultContracts' + defaultContracts)
      fetchdefaultContracts();
    } else {
      console.log("No selected row or row ID is undefined");

      // Fetch data again or remove the item from `agentData` state to update UI
    }
  };

  const handleDelete2 = async () => {
    if (selectedRow && selectedRow.id) {
      console.log('selected row is ' + selectedRow + selectedRow.id);
      await deleteDoc(doc(db, 'contracts', selectedRow.id));
      setSelectedRow(null); // Reset selection
      resetFormContracts();
      fetchContracts();
    } else {
      console.log("No selected row or row ID is undefined");

      // Fetch data again or remove the item from `agentData` state to update UI
    }
  };

  const handleEdit1 = async () => {
    if (selectedRow && selectedRow.id) { // Ensure selectedRow has an 'id' property
      try {
        const docRef = doc(db, 'contracts', selectedRow.id); // Reference to the Firestore document
        await updateDoc(docRef, {
       // company: '',
        productsGroup: selectedProductGroup,
      //  product: '',
        commissionHekef:commissionPercentHekef1,
        commissionNifraim:commissionPercentNifraim1,
        commissionNiud:commissionPercentNiud1
          });
        console.log("Document successfully updated");
        setSelectedRow(null); 
        resetFormDefault();             
        fetchdefaultContracts();
      
      } catch (error) {
        console.error("Error updating document:", error);     
      }
    } else {
      console.log("No row selected or missing document ID");
    }
  };

  const handleEdit2 = async () => {
    if (selectedRow && selectedRow.id) { // Ensure selectedRow has an 'id' property
      try {
        const docRef = doc(db, 'contracts', selectedRow.id); // Reference to the Firestore document
        await updateDoc(docRef, {
        company: selectedCompany,
        //productsGroup: '',
        product: selectedProduct,
        commissionHekef:commissionPercentHekef2,
        commissionNifraim:commissionPercentNifraim2,
        commissionNiud:commissionPercentNiud2
        
        });
        console.log("Document successfully updated");
        setSelectedRow(null); 
        resetFormContracts();               
        fetchContracts();
      
      } catch (error) {
        console.error("Error updating document:", error);     
      }
    } else {
      console.log("No row selected or missing document ID");
    }
  };



return (
  <div>
    {/* First Frame */}
    <div className="frame-container bg-custom-white " style={{ maxWidth: '1000px', margin: '0 auto', padding: '10px 20px 20px 20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '80px' }}>
      <h2 style={{ textAlign: 'center' , marginBottom: '10px', fontSize:'12px' }}>עמלות ברירת מחדל</h2>    
      <div style={{ marginTop: '20px', width: '90%', margin: '0 auto', overflowX: 'auto' }}>
      {/*   {defaultContracts.length > 0 ? ( */}
          <div className="table-container" style={{ width: '100%' }}>
            <table style={{ width: '100%'  }}>
              <thead>
                <tr>
                  <th>קבוצת מוצרים</th>
                  <th>עמלת היקף</th>
                  <th>עמלת נפרעים</th>
                  <th>עמלת ניוד</th>
                </tr>
              </thead>
              <tbody>
                {defaultContracts.map((item) => (
                  <tr key={item.id}

                  onClick={() => handleRowClick(item)}
                  onMouseEnter={() => setHoveredRowId(item.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  className={`${selectedRow && selectedRow.id === item.id ? 'selected-row' : ''} ${hoveredRowId === item.id ? 'hovered-row' : ''}`}>
                    <td>{productGroupMap[item.productsGroup]}</td> {/* Use the map for fast lookup */}
                    <td>{item.commissionHekef}</td>
                    <td>{item.commissionNifraim}</td>
                    <td>{item.commissionNiud}</td>

                  </tr>
                ))}
                 <tr>
        <td>
          <select
            id="productGroupSelect1"
            value={selectedProductGroup}
            onChange={(e) => setSelectedProductGroup(e.target.value)}
            style={{ width: '100%' }}>
            <option value="">בחר קבוצת מוצר</option>
            {productGroupsDB.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </td>
        <td>
          <input type="text" id="priceInputHekef1" value={commissionPercentHekef1} onChange={handlecommissionPercentHekef1} style={{ width: '100%' }} />
        </td>
        <td>
          <input type="text" id="priceInputNifraim1" value={commissionPercentNifraim1} onChange={handlecommissionPercentNifraim1} style={{ width: '100%' }} />
        </td>
        <td>
          <input type="text" id="priceInputNiud1" value={commissionPercentNiud1} onChange={handlecommissionPercentNiud1} style={{ width: '100%' }} />
        </td>
      </tr>
  
              </tbody>
            </table>
          </div>
     {/*    ) : (
          <p>No data available for the selected agent.</p>
        )
        
    }*/}
      </div>
      <div className="form-group button-group" >
         <button type="button" onClick={handleSubmitDiffultValue} disabled={!canSubmit1 || isEditing1}>הזן</button>      
          <button type="button" disabled={selectedRow === null} onClick={handleDelete1} >מחק</button>
          <button type="button" disabled={selectedRow === null} onClick={handleEdit1}>עדכן</button>
          <button type="button" onClick={resetFormDefault}>נקה</button>
        </div>
      </div>

       

    {/* Second Frame */}

    <div className="frame-container" style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9', marginTop: '20px' }}>
      <h2 style={{ textAlign: 'center' , marginBottom: '10px' , fontSize:'12px' }}>עמלות  למוצר</h2>
      <div style={{ marginTop: '20px', width: '90%', margin: '0 auto', overflowX: 'auto' }}>
      {/* {contracts.length > 0 ? (*/}
      
          <div className="table-container" style={{ overflowX: 'auto', maxHeight: '300px' }}>
            <table>
              <thead>
                
                <tr>
                  <th>חברה </th>
                  <th>מוצר </th>
                  <th>עמלת היקף</th>
                  <th>עמלת נפרעים</th>
                  <th>עמלת ניוד</th>
                </tr>
              </thead>
              <tbody>

              <tr className="hover:bg-custom-light-blue">
        <td>
          <select
            id="companySelect"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            style={{ width: '100%' }}>
            <option value="">בחר חברה</option>
            {companies.map((companyName, index) => (
    <option key={index} value={companyName}>{companyName}</option>
    ))}
          </select>
        </td>
        <td>
          <select
            id="productSelect2"
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            style={{ width: '100%' }}>
            <option value="">בחר מוצר</option>
            {products.map((product) => (
         <option key={product.id} value={product.name}>{product.name}</option>
    ))}
          </select>
        </td>
        <td>
          <input type="text" id="priceInputHekef2" value={commissionPercentHekef2} onChange={handlecommissionPercentHekef2} style={{ width: '100%' }} />
        </td>
        <td>
          <input type="text" id="priceInputNifraim2" value={commissionPercentNifraim2} onChange={handlecommissionPercentNifraim2} style={{ width: '100%' }} />
        </td>
        <td>
          <input type="text" id="priceInputNiud2" value={commissionPercentNiud2} onChange={handlecommissionPercentNiud2} style={{ width: '100%' }} />
        </td>
      </tr>
  
                {contracts.map((item) => (
                  <tr key={item.id}

                  onClick={() => handleRowClick2(item)}
                  onMouseEnter={() => setHoveredRowId(item.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  className={`${selectedRow && selectedRow.id === item.id ? 'selected-row' : ''} ${hoveredRowId === item.id ? 'hovered-row' : ''}`}>

                    <td>{item.company}</td>
                    <td>{item.product}</td>
                    <td>{item.commissionHekef}</td>
                    <td>{item.commissionNifraim}</td>
                    <td>{item.commissionNiud}</td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
           {/*    ) : (
          <p>No data available for the selected agent.</p>
        )
        
    }*/}
      </div>
      <div className="form-group button-group" >
          <button type="button" onClick={handleSubmitFullValuesCommission} disabled={!canSubmit2 || isEditing2 }>הזן </button>
          <button type="button" disabled={selectedRow === null} onClick={handleDelete2} >מחק</button>
          <button type="button" disabled={selectedRow === null} onClick={handleEdit2}>עדכן</button>
          <button type="button" onClick={resetFormContracts}>נקה</button>

        </div>
      </div>

        
       
      </div>
      
  
);};
export default ManageContracts;