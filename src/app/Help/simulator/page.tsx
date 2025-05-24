'use client';

import React, { useEffect, useState } from "react";
import Image from "next/image";
// import './simulator.css';
import "../HelpPages.css";
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const SimulatorHelp = () => {

  const [isClient, setIsClient] = useState(false);

useEffect(() => {
  setIsClient(true);
}, []);

if (!isClient) return null;



  return (
    <div className="help-container">
      <h1>📖 סימולטור חישוב עמלות</h1>
      
      <h2>📌 שימוש בסימולטור</h2>
      <p>בדף הסימולטור ניתן להזין ערכים במגוון שדות ולחשב את העמלה הצפויה.</p>
      <div className="cards-container">
  <div className="card">
    <div className="card-header">
      💰 <span>שכר</span>
    </div>
    <div className="card-body">
      <p>הזנת סכום השכר של הסוכן.</p>
    </div>
  </div>

  <div className="card">
    <div className="card-header">
      📊 <span>הפרשות</span>
    </div>
    <div className="card-body">
      <p>ערך ההפרשות שצריך להילקח בחשבון.</p>
    </div>
  </div>

  <div className="card">
    <div className="card-header">
      📅 <span>חודשי</span>
    </div>
    <div className="card-body">
      <p>מספר החודשים הרלוונטיים לחישוב.</p>
    </div>
  </div>

  <div className="card">
    <div className="card-header">
      ⚙️ <span>תפוקה</span>
    </div>
    <div className="card-body">
      <p>הזנת תפוקת העבודה של הסוכן.</p>
    </div>
  </div>

  <div className="card">
    <div className="card-header">
      🔄 <span>ניוד</span>
    </div>
    <div className="card-body">
      <p>הכנסת נתוני ניוד הפוליסות.</p>
    </div>
  </div>
</div>
      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/simulation.png" alt="הזנת ערכים בסימולטור" width={800} height={400} />

      <h2>🔹 שימוש בסימולטור </h2>
      <p>לאחר הזנת הערכים, יש ללחוץ על כפתור <strong>&quot;חשב&quot;</strong>. בצד השמאלי של הדף תופיע הטבלה עם הדירוג המתאים.</p>
      
      <h2>⚠️ נקודות חשובות</h2>
      <p>• יש למלא את כל השדות לפני ביצוע החישוב.
      <br/>• הדירוג והחישובים מבוססים על הערכים שהוזנו בסימולטור.
      <br/>• ניתן לשנות את הנתונים ולחשב מחדש לפי הצורך.</p>

      <HelpNavigation />
    </div>
  );
};

export default SimulatorHelp;
