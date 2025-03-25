import React from "react";
import Link from "next/link";
import './help.css';


const HelpCenter = () => {

    
  return (
    <div className="help-container">
      <h1>מרכז העזרה - MagicSale</h1>
      <ul>
        <li><Link href="/Help/deals">ניהול עסקאות ועמידה ביעדים</Link></li>
        <li><Link href="/Help/clients">ניהול לקוחות</Link></li>
        <li><Link href="/Help/commissions">עמלות</Link></li>
        <li><Link href="/Help/reports">דוחות</Link></li>
      </ul>
    </div>
  );
};

export default HelpCenter;
