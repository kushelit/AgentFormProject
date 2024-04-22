import { ChangeEventHandler, FormEventHandler, useEffect, useState } from "react";
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


  //const [quantity, setQuantity] = useState('');
  //const [date, setDate] = useState('');
  //const [description, setDescription] = useState('');



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
   // commissionTypes,
    //setSelectedCommissionTypes,
    //selectedCommissionTypes
   
  } = useFetchMD();

  const handlecommissionPercentHekef1: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    setCommissionPercentHekef1(value);
};

const handlecommissionPercentNifraim1: ChangeEventHandler<HTMLInputElement> = (e) => {
  const value = e.target.value;
  setCommissionPercentNifraim1(value);
};



const handlecommissionPercentNiud1: ChangeEventHandler<HTMLInputElement> = (e) => {
  const value = e.target.value;
  setCommissionPercentNiud1(value);
};

const handlecommissionPercentHekef2: ChangeEventHandler<HTMLInputElement> = (e) => {
  const value = e.target.value;
  setCommissionPercentHekef2(value);
};

const handlecommissionPercentNifraim2: ChangeEventHandler<HTMLInputElement> = (e) => {
const value = e.target.value;
setCommissionPercentNifraim2(value);
};




const handlecommissionPercentNiud2: ChangeEventHandler<HTMLInputElement> = (e) => {
  const value = e.target.value;
  setCommissionPercentNiud2(value);
  };
  
const resetFormDefault = () => {
  setSelectedProductGroup('');
  setCommissionPercentHekef1('');
  setCommissionPercentNifraim1('');
  setCommissionPercentNiud1('');

};


const resetFormContracts = () => {
  setSelectedCompany('');
  setSelectedProduct('');
  setCommissionPercentHekef2('');
  setCommissionPercentNifraim2('');
  setCommissionPercentNiud2('');

};



  const handleSubmitDiffultValue = async () => {
  //  event.preventDefault();
    try {
     
        if (!detail || !detail.agentId) return;
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
   //   setIsEditing(false);
   //   if (selectedAgent) {
    fetchdefaultContracts();
    //  }
    } catch (error) {
      console.error('Error adding document:', error);
    }
  };

  const handleSubmitFullValuesCommission = async () => {
    //  event.preventDefault();
      try {
       
          if (!detail || !detail.agentId) return;
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
      const q = query(
        collection(db, 'contracts'), 
        where('AgentId', '==', detail.agentId),
        where('productsGroup', '==', '')  // Adjust if necessary
      );
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id, 
        ...doc.data() 
      }));
      setContracts(data);
    };
  
    useEffect(() => {
      fetchContracts();
    }, [detail]);  // Dependency array


  const fetchdefaultContracts = async () => {
    if (!detail || !detail.agentId) return;
    const diffContractsQuery = query(
        collection(db, 'contracts'),
        where('AgentId', '==', detail.agentId),       
        where('productsGroup', '!=', '')  // Correct use of '!=' operator
        
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

console.log(item.commissionNifraim + '  ');
console.log(commissionPercentNifraim1);

  };

  const handleDelete1 = async () => {
    if (selectedRow && selectedRow.id) {
      await deleteDoc(doc(db, 'contracts', selectedRow.id));
      setSelectedRow(null); // Reset selection
      resetFormDefault();
      fetchdefaultContracts
    } else {
      console.log("No selected row or row ID is undefined");

      // Fetch data again or remove the item from `agentData` state to update UI
    }
  };

  const handleDelete2 = async () => {
    if (selectedRow && selectedRow.id) {
      await deleteDoc(doc(db, 'contracts', selectedRow.id));
      setSelectedRow(null); // Reset selection
      resetFormContracts();
      fetchContracts
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

        
          // Include any additional fields as needed
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

        
          // Include any additional fields as needed
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
    <div className="frame-container" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9', marginTop: '50px' }}>
      <h2 style={{ textAlign: 'center' }}>עמלות ברירת מחדל</h2>
      <div style={{ paddingTop: '2rem', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flexBasis: '22%' }}>
          <label htmlFor="productGroupSelect1">קבוצת מוצר:</label>
          <select
            id="productGroupSelect1"
            value={selectedProductGroup}
            onChange={(e) => setSelectedProductGroup(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">בחר קבוצת מוצר</option>
            {productGroupsDB.map((group) => (
              <option key={group.id} value={group.id}>
                    {group.name}
                 </option>            ))}
          </select>
        </div>
        <div className="form-group" style={{ flexBasis: '22%' }}>
          <label htmlFor="priceInputHekef1">עמלת היקף:</label>
          <input type="text" id="priceInputHekef1" value={commissionPercentHekef1} onChange={handlecommissionPercentHekef1} style={{ width: '100%' }} />
        </div>
        <div className="form-group" style={{ flexBasis: '22%' }}>
          <label htmlFor="priceInputNifraim1">עמלת נפרעים:</label>
          <input type="text" id="priceInputNifraim1" value={commissionPercentNifraim1} onChange={handlecommissionPercentNifraim1} style={{ width: '100%' }} />
        </div>
        <div className="form-group" style={{ flexBasis: '22%' }}>
          <label htmlFor="priceInputNifraim1">עמלת ניוד :</label>
          <input type="text" id="priceInputNiud1" value={commissionPercentNiud1} onChange={handlecommissionPercentNiud1} style={{ width: '100%' }} />
        </div>
        <div className="form-group" style={{ flexBasis: '22%' }}>
          <button type="button" onClick={handleSubmitDiffultValue} style={{ width: '100%', padding: '10px' }}>
            הזן
          </button>

          <button type="button" disabled={selectedRow === null} onClick={handleDelete1} >מחק</button>
            <button type="button" disabled={selectedRow === null} onClick={handleEdit1}>עדכן</button>
            <button type="button" onClick={resetFormDefault}>נקה</button>

        </div>
      </div>
      <div style={{ marginTop: '20px' }}>
        {defaultContracts.length > 0 ? (
          <div className="table-container" style={{ overflowX: 'auto', maxHeight: '300px' }}>
            <table>
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
                    <td>{item.productsGroup}</td>
                    <td>{item.commissionHekef}</td>
                    <td>{item.commissionNifraim}</td>
                    <td>{item.commissionNiud}</td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No data available for the selected agent.</p>
        )}
      </div>
    </div>

    {/* Second Frame */}
    <div className="frame-container" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9', marginTop: '50px' }}>
      <h2 style={{ textAlign: 'center' }}>עמלות  למוצר</h2>
      <div style={{ paddingTop: '2rem', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap' }}>
              
<div className="form-group" style={{ flexBasis: '22%' }}>
<label htmlFor="companySelect">חברה:</label>
<select
  id="companySelect"
  value={selectedCompany}
  onChange={(e) => setSelectedCompany(e.target.value)}
  style={{ width: '100%' }}
>
  <option value="">בחר חברה</option>
  {companies.map((companyName, index) => (
    <option key={index} value={companyName}>{companyName}</option>
  ))}
</select>
</div>        
   <div className="form-group" style={{ flexBasis: '22%' }}>
          <label htmlFor="productSelect2">מוצר:</label>
          <select
            id="productSelect2"
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">בחר מוצר</option>
            {products.map((product) => (
         <option key={product.id} value={product.name}>{product.name}</option>
         ))}
          </select>
        </div>     
        <div className="form-group" style={{ flexBasis: '22%' }}>
          <label htmlFor="priceInputHekef2">עמלת היקף:</label>
          <input type="text" id="priceInputHekef2" value={commissionPercentHekef2} onChange={handlecommissionPercentHekef2} style={{ width: '100%' }} />
        </div>
        <div className="form-group" style={{ flexBasis: '22%' }}>
          <label htmlFor="priceInputNifraim2">עמלת נפרעים:</label>
          <input type="text" id="priceInputNifraim2" value={commissionPercentNifraim2} onChange={handlecommissionPercentNifraim2} style={{ width: '100%' }} />
        </div>
        <div className="form-group" style={{ flexBasis: '22%' }}>
          <label htmlFor="priceInputNiud2">עמלת ניוד:</label>
          <input type="text" id="priceInputNiud2" value={commissionPercentNiud2} onChange={handlecommissionPercentNiud2} style={{ width: '100%' }} />
        </div>
        <div className="form-group" style={{ flexBasis: '22%' }}>
          <button type="button" onClick={handleSubmitFullValuesCommission} style={{ width: '100%', padding: '10px' }}>
            הזן
          </button>

          <button type="button" disabled={selectedRow === null} onClick={handleDelete2} >מחק</button>
          <button type="button" disabled={selectedRow === null} onClick={handleEdit2}>עדכן</button>
          <button type="button" onClick={resetFormContracts}>נקה</button>

        </div>
      </div>
      <div style={{ marginTop: '20px' }}>
        {contracts.length > 0 ? (
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
        ) : (
          <p>No data available for the selected agent.</p>
        )}
      </div>
    </div>
  </div>
);};
export default ManageContracts;

