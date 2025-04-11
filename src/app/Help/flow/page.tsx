import React from "react";
import Image from "next/image";
import "./flow.css";
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const FlowHelp = () => {
  return (
    <div className="help-container">
      <h1>📖 ניהול תור לידים - FLOW</h1>

      <h2>📝 יצירת לידים</h2>
      <p>
        תור הלידים מאפשר לסוכנות לנהל את הלידים שנכנסו למערכת. ניתן להוסיף לידים בדרכים הבאות:
      </p>
      <ul>
        <li>➕ <strong>יצירה ידנית:</strong> באמצעות כפתור "צור ליד חדש".</li>
        <li>🌍 <strong>קבלת ליד מממשק חיצוני:</strong> דרך אינטגרציות (גוגל, פייסבוק).</li>
      </ul>
      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/leadsflow.png" alt="יצירת ליד חדש" width={800} height={400} />

      <h2>✏️ עריכה מהירה</h2>
      <p>
        המסך מאפשר עריכה מהירה של שדות חשובים ישירות בטבלה, מבלי להיכנס לעמוד פרטי הליד.
      </p>
      <ul>
        <li>🔄 עדכון **סטאטוס ליד** ישירות בטבלה.</li>
        <li>📅 עדכון **שם נציג** ללא מעבר לעמוד נפרד.</li>
      </ul>
      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/floweditonline.png" alt="עריכת ליד בטבלה" width={800} height={400} />

      <h2>🔄 ניהול סטאטוסים</h2>
      <p>
        כל ליד במערכת מכיל סטאטוס שמתעדכן בהתאם להתקדמות הטיפול בו. ניתן לשנות את הסטאטוס בלחיצה על התא המתאים.
      </p>

      <h2>📅 עדכון תאריך חזרה ללקוח</h2>
      <p>
        אם יש צורך ליצור מעקב לליד, ניתן לעדכן תאריך חזרה ישירות מהטבלה, כדי לתזכר את הסוכן לטפל בליד במועד מאוחר יותר.
      </p>
      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/floweditdelete.png" alt="עדכון תאריך חזרה ללקוח" width={200} height={100} />

      <HelpNavigation />
    </div>
  );
};

export default FlowHelp;
