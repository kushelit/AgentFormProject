'use client';

import { query, collection, where, getDocs } from "firebase/firestore";
import { useState, useEffect } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase/firebase";
import './summaryTable.css';
import { useSearchParams } from 'next/navigation'

const SummaryTable = () => {
  const searchParams = useSearchParams();
  const agentName = searchParams?.get('agentName');


  //check if i can delete//
  const [finansimSum, setFinansimSum] = useState(0);
  const [pensiaSum, setPensiaSum] = useState(0);
  const [insuranceSum, setInsuranceSum] = useState(0);
  const [niudPensiaSum, setNiudPensiaSum] = useState(0);
  // Add more states as needed for other sums

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
      let niudPensiaTotal = 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        if (['ניהול תיקים', 'גמל להשקעה', 'השתלמות', 'גמל', 'פוליסת חיסכון'].includes(data.product)) {
          finansimTotal += (parseInt(data.finansimZvira) || 0); // Existing calculation for finansimTotal
        }
        // New condition for calculating pensiaTotal
        if (['מחלות קשות', 'בריאות', 'ביטוח משכנתא- חיים'].includes(data.product)) {
          // Double the pensiaPremia value by 12 and add to the total
          insuranceTotal += (parseInt(data.insPremia) || 0) * 12;
        }

        pensiaTotal += (parseInt(data.pensiaPremia) || 0) * 12;
        niudPensiaTotal += parseInt(data.pensiaZvira) || 0;
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
      <h1>לוח מרכזי, סוכן :  {agentName}</h1>
      <table>
        {/* Table headers */}
        <tbody>
          <tr>
            <td>סך פיננסים</td>
            <td>{finansimSum.toLocaleString()}</td>
          </tr>
          <tr>
            <td>סך פנסיה</td>
            <td>{pensiaSum.toLocaleString()}</td>
          </tr>
          <tr>
            <td>סך ביטוח</td>
            <td>{insuranceSum.toLocaleString()}</td>
          </tr>
          <tr>
            <td>ניוד פנסיה</td>
            <td>{niudPensiaSum.toLocaleString()}</td>
          </tr>


          {/* Add more rows for other sums */}
        </tbody>
      </table>
      <div>
        <Link href="/">
          Go Back to Agent Form
        </Link>
      </div>
    </div>
  );
};

export default SummaryTable;