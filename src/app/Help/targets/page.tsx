'use client';

import React, { useEffect, useState } from "react";
import Image from "next/image";
// import './targets.css';
import "../HelpPages.css";
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const TargetsHelp = () => {

  const [isClient, setIsClient] = useState(false);

useEffect(() => {
  setIsClient(true);
}, []);

if (!isClient) return null;



  return (
    <div className="help-container">
      <h1>📖 ניהול יעדים ומבצעים</h1>

      <h2>📌 מבנה הדף</h2>
      <p>בדף זה ניתן להגדיר ולנהל את יעדי הסוכנות ואת ההקצאה לעובדי הסוכנות.</p>
      <p>הדף מחולק לשתי לשוניות:</p>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">
            🎯 <span>הגדרת יעדים ומבצעים</span>
          </div>
          <div className="card-body">
            <p>הגדרת יעדים ברמת הסוכנות עם כל הפרטים הנדרשים.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            👥 <span>הקצאת יעדים לעובדים</span>
          </div>
          <div className="card-body">
            <p>שיוך יעדים לעובדי הסוכנות לפי סוג יעד.</p>
          </div>
        </div>
      </div>

      <h2>🎯 הגדרת יעדים ומבצעים</h2>
      <p>במסך זה כל סוכן יכול להגדיר לעצמו את היעדים לסוכנות, תוך ציון:</p>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">
            📅 <span>תאריכי התחלה וסיום לכל יעד</span>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            🏢 <span>חברות משתתפות בכל יעד</span>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            🔄 <span>הגדרת יעד מתחדש</span>
          </div>
          <div className="card-body">
            <p>האם היעד מתחדש כל חודש.</p>
          </div>
        </div>
      </div>

      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/mdyeadim.png" alt="הגדרת יעדים" width={800} height={400} />

      <h2>⭐ שיוך שווי כוכבים ליעד</h2>
      <p>בטבלה התחתונה ניתן לשייך ליעד שווי כוכבים לעמידה ביעד באמצעות כוכבים.</p>

      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/mdstars.png" alt="שיוך כוכבים ליעד" width={800} height={400} />

      <h2>👥 הקצאת יעדים לעובדים</h2>
      <p>במסך זה כל סוכן יכול להקצות יעד לעובדיו, עם הפרטים הבאים:</p>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">
            📊 <span>סוג יעד</span>
          </div>
          <div className="card-body">
            <p>ביטוח, פיננסים, פנסיה או כוכבים.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            📅 <span>תאריכי היעד</span>
          </div>
          <div className="card-body">
            <p>והחברות המשתתפות.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            📈 <span>חישוב אחוז עמידה ביעד</span>
          </div>
          <div className="card-body">
            <p>לכל עובד על בסיס הנתונים שהוזנו.</p>
          </div>
        </div>
      </div>

      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/mdyeadimoved.png" alt="הקצאת יעדים לעובדים" width={800} height={400} />

      <h2>🔄 שכפול יעדים</h2>
      <p>המערכת מאפשרת לשכפל יעדים לעובד דרך כפתור <strong>שכפל יעדים</strong>, בתנאים הבאים:</p>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">
            ✅ <span>קיום יעד מתחדש</span>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            ✅ <span>קיום יעד משויך לעובד לחודש הנוכחי</span>
          </div>
        </div>
      </div>

      <p>היעדים המשוכפלים משמשים להצגת נתונים בדף העסקאות ועמידה ביעדים.</p>

      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/duplicate.png" alt="שכפול יעדים" width={200} height={200} />

      <HelpNavigation />
    </div>
  );
};

export default TargetsHelp;
