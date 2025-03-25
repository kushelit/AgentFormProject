import React from "react";
import Image from "next/image";
import './commissions.css';
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";


const CommissionsHelp = () => {
  return (
    <div className="help-container">
      <h1>📖 ניהול עסקאות ועמידה ביעדים</h1>

      <h2>📊 עמידה ביעדים</h2>
      <Image src="/static/img/deals.png" alt="ניהול עסקאות" width={800} height={400} />
        {/* 🔗 הוספת הניווט לעמודים נוספים */}
        <HelpNavigation />
    </div>
  );
};

export default CommissionsHelp;
