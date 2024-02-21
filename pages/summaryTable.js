import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { db } from '../firebase'; // Adjust the path as needed
import { collection, query, where, getDocs,doc, addDoc, deleteDoc,updateDoc  } from 'firebase/firestore';
import Link from 'next/link';
import './summaryTable.css';


  const SummaryTable = () => {
  const router = useRouter();
  const { agentName } = router.query;


  //check if i can delete//
const [finansimSum, setFinansimSum] = useState(0);
const [pensiaSum, setPensiaSum] = useState(0);
const [insuranceSum, setInsuranceSum] = useState(0);
const [niudPensiaSum, setNiudPensiaSum] = useState(0);
  // Add more states as needed for other sums

  // example to superate condition//

   //useEffect(() => {
     // const fetchData = async () => {
      //if (!agentName) return; // If agentName is not defined, exit early

      //const salesQuery = query(
       // collection(db, 'sales'),
        //where('agent', '==', agentName),
        //where('minuySochen', '==', false),
        //where('statusPolicy', 'in', ['הצעה', 'פעילה']),
        //where ('product', 'in', ['ניהול תיקים','גמל להשקעה', 'השתלמות','גמל', 'פוליסת חיסכון'])
      //);

      //const querySnapshot = await getDocs(salesQuery);
     // let finansimTotal = 0;
     // let pensiaTotal = 0;
      // Initialize more totals as needed

     // querySnapshot.forEach((doc) => {
      //  const data = doc.data();
       // if (['חסכון', 'גמל'].includes(data.product)) {
      //    finansimTotal += Number(data.finansimZvira || 0);
          // Calculate other totals similarly
      //  }

        // Assuming you have a way to identify pension sums, add to pensiaTotal
      //}
     /// );

     // setFinansimSum(finansimTotal);
     // setPensiaSum(pensiaTotal);
      // Update more states as needed
 //   };

 //   fetchData();
 // }, [agentName]);

//check if can delete ///
 
//useEffect(() => {
  //  const fetchDataForPensia = async () => {
    //  if (!agentName) return;
  
      //const pensiaQuery = query(
       // collection(db, 'sales'),
        //where('agent', '==', agentName),
        //where('minuySochen', '==', false),
        //where('statusPolicy', 'in', ['פעילה', 'הצעה'])
      //);
  
      //const querySnapshot = await getDocs(pensiaQuery);
     // let newPensiaTotal = 0;
  
   //   querySnapshot.forEach((doc) => {
   //     const data = doc.data();
        // Double the pensiaPremia value by 12 and add to the new total
  //      newPensiaTotal += Number(data.pensiaPremia || 0) * 12;
 //     });
  
//      setPensiaSum(newPensiaTotal); // This will overwrite the value set in the first useEffect if conditions are met
 //   };
  
  //  fetchDataForPensia();
 // }, [agentName]);

//////////try //////

useEffect(() => {
    const fetchData = async () => {
      if (!agentName) return; // If agentName is not defined, exit early
  
       const salesQuery = query(
        collection(db, 'sales'),
        where('agent', '==', agentName),
        where('minuySochen', '==', false),
        where('statusPolicy', 'in', ['פעילה', 'הצעה']), // Added 'לידה' to the existing conditions
        //where ('product', 'in', ['ניהול תיקים','גמל להשקעה', 'השתלמות','גמל', 'פוליסת חיסכון'])
      );
  
      const querySnapshot = await getDocs(salesQuery);
      let finansimTotal = 0;
      let pensiaTotal = 0; // Initialize pensiaTotal
      let insuranceTotal = 0;
      let niudPensiaTotal=0;

       querySnapshot.forEach((doc) => {
        const data = doc.data();
       
        if (['ניהול תיקים','גמל להשקעה', 'השתלמות','גמל', 'פוליסת חיסכון'].includes(data.product)) {
        finansimTotal += Number(data.finansimZvira || 0); // Existing calculation for finansimTotal
        }
        // New condition for calculating pensiaTotal
       if (['מחלות קשות','בריאות', 'ביטוח משכנתא- חיים'].includes(data.product)) {
           // Double the pensiaPremia value by 12 and add to the total
           insuranceTotal += Number(data.insPremia || 0) * 12;
       }
          
          pensiaTotal += Number(data.pensiaPremia || 0) * 12;
          niudPensiaTotal += Number(data.pensiaZvira || 0) ;
      });
  
      setFinansimSum(finansimTotal);
      setPensiaSum(pensiaTotal); // Update pensiaSum state with the calculated total
      setInsuranceSum(insuranceTotal);
      setNiudPensiaSum(niudPensiaTotal);
    };
  
    fetchData();
  }, [agentName]);


  // Render your table with the calculated sums
  return (
    <div>
      <h1>Summary for {agentName}</h1>
      <table>
        {/* Table headers */}
        <tbody>
          <tr>
            <td>סך פיננסים</td>
            <td>{finansimSum}</td>
          </tr>
          <tr>
            <td>סך פנסיה</td>
            <td>{pensiaSum}</td>
          </tr>
          <tr>
            <td>סך ביטוח</td>
            <td>{insuranceSum}</td>
          </tr>
          <tr>
            <td>ניוד פנסיה</td>
            <td>{niudPensiaSum}</td>
          </tr>


          {/* Add more rows for other sums */}
        </tbody>
      </table>
      <div>
      <Link href={`/AgentForm?selectedAgent=${agentName}`}>
      <a>Go Back to Agent Form</a>
</Link>
      </div>
    </div>
  );
};

export default SummaryTable;