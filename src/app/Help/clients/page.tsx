import React from "react";
import Image from "next/image";
import './clients.css';
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";



const ClientsHelp = () => {
  return (
    <div className="help-container">
      <h1>📖 ניהול עסקאות ועמידה ביעדים</h1>

      <h2>📊 עמידה ביעדים</h2>


      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/deals.png" alt="ניהול עסקאות" width={800} height={400} />
        {/* 🔗 הוספת הניווט לעמודים נוספים */}
        <HelpNavigation />
    </div>
    
  );
};

export default ClientsHelp;
