import React from "react";
import Link from "next/link";
import './help.css';


const HelpCenter = () => {

    
  return (
    <div className="help-container">
      <h1>מרכז העזרה - MagicSale</h1>
      <ul>
      <li><Link href="/Help/deals">💼 ניהול עסקאות ועמידה ביעדים</Link></li>
      <li><Link href="/Help/clients">🧑‍💼 ניהול לקוחות</Link></li>
      <li><Link href="/Help/central">🏢 דף מרכז</Link></li>
      <li><Link href="/Help/commissions">💰 ניהול עמלות</Link></li>
{/* <li><Link href="/Help/reports">📈 דוחות</Link></li> */}
      <li><Link href="/Help/simulator">🧮 סימולטור</Link></li>
      <li><Link href="/Help/targets">🎯 ניהול יעדים ומבצעים</Link></li>
      <li><Link href="/Help/flow">🔄 Flow - ניהול לידים</Link></li>
      <li><Link href="/Help/mdflow">🧩 Flow - ניהול הגדרות לידים</Link></li>
      <li><Link href="/Help/TeamPermissions">🛡️ ניהול הרשאות</Link></li>
      </ul>
    </div>
  );
};

export default HelpCenter;
