'use client';

import React, { useEffect, useState } from "react";
import Image from "next/image";
import "../HelpPages.css";
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const LeadSettingsHelp = () => {

  const [isClient, setIsClient] = useState(false);

useEffect(() => {
  setIsClient(true);
}, []);

if (!isClient) return null;

  return (
    <div className="help-container">
      <h1>📖 ניהול מקורות ולידים</h1>

      <h2>📌 מבנה הדף</h2>
      <p>בדף זה מתבצע ניהול כולל של מקורות הלידים ושל סטאטוס הלידים במערכת.</p>
      <p>הדף מחולק לשתי טבלאות עיקריות:</p>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">
            🗂️ <span>ניהול מקורות ליד</span>
          </div>
          <div className="card-body">
            <p>ניהול מקורות מהם מגיעים לידים לסוכנות: קמפיינים, שיתופי פעולה, הפניות משפחה ועוד.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            📋 <span>ניהול סטאטוס ליד</span>
          </div>
          <div className="card-body">
            <p>ניהול מצב הליד במערכת - סטאטוסים מערכתיים וסטאטוסים מותאמים אישית לפי צורך הסוכנות.</p>
          </div>
        </div>
      </div>

      <h2>🗂️ ניהול מקורות ליד</h2>
      <p>בטבלה זו ניתן להגדיר את מקורות הלידים בסוכנות:</p>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">
            ➕ <span>הוספת מקור ליד חדש</span>
          </div>
          <div className="card-body">
            <p>באמצעות לחיצה על כפתור &quot;צור מקור ליד חדש&quot; ניתן להקים מקור חדש.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            ✏️ <span>עריכת מקור ליד</span>
          </div>
          <div className="card-body">
            <p>ניתן לערוך את שם מקור הליד הקיים לפי הצורך.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            ❌ <span>מחיקת מקור ליד</span>
          </div>
          <div className="card-body">
            <p>מחיקה מתבצעת באמצעות לחיצה על כפתור מחיקה ליד מקור קיים.</p>
          </div>
        </div>
      </div>

      <h2>📋 ניהול סטאטוס ליד</h2>
      <p>בטבלה זו מוצגים כל סטאטוסי הלידים במערכת:</p>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">
            🛡️ <span>סטאטוס מערכת</span>
          </div>
          <div className="card-body">
            <p>סטאטוסים בסיסיים מובנים במערכת (כגון: &quot;אין מענה&quot;, &quot;ליד חדש&quot;) - לא ניתן לערוך או למחוק.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            🛠️ <span>סטאטוס מותאם אישית</span>
          </div>
          <div className="card-body">
            <p>ניתן להקים סטאטוסים מותאמים אישית לסוכנות (לדוגמה: &quot;חתם עסקה&quot;,&quot;מחכים למסמכים&quot;).</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            ➕ <span>הוספת סטאטוס חדש</span>
          </div>
          <div className="card-body">
            <p>באמצעות לחיצה על &quot;סטאטוס ליד חדש&quot; ניתן להוסיף סטאטוס נוסף לניהול הלידים.</p>
          </div>
        </div>
      </div>

      <h2>🖼️ המחשה מהמערכת</h2>

      <h3>📌 ניהול מקורות ליד:</h3>
      <Image src="/static/img/leadsources.png" alt="ניהול מקורות ליד" width={800} height={400} />

      <h3>📌 ניהול סטאטוס ליד:</h3>
      <Image src="/static/img/leadstatus.png" alt="ניהול סטאטוס ליד" width={800} height={400} />

      <HelpNavigation />
    </div>
  );
};

export default LeadSettingsHelp;
