import React from "react";
import Image from "next/image";
import './commissions.css';
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const CommissionsHelp = () => {
  return (
    <div className="help-container">
      <h1>📖 ניהול עמלות</h1>
      
      <h2>📌 מבנה הדף</h2>
      <p>דף ניהול העמלות מחולק לשתי לשוניות:</p>
      <ul>
        <li>📝 <strong>הגדרת עמלות ברירת מחדל</strong> – הגדרה ברמת קבוצת מוצר של אחוזי עמלות ברירת מחדל לסוכן.</li>
        <li>🎯 <strong>הגדרת עמלות למוצר</strong> – מאפשרת הגדרה מדויקת יותר של אחוזי עמלה לכל מוצר בחברות השונות.</li>
      </ul>

      <h2>🔹 הגדרת עמלות ברירת מחדל</h2>
      <p>באפשרותך להגדיר אחוזי עמלות ברירת מחדל לפי קבוצות מוצרים. עמלות אלה ישמשו כברירת מחדל אם לא הוגדרו עמלות ספציפיות למוצר.</p>
      
      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/commissionBM.png" alt="הגדרת עמלות" width={800} height={400} />

      <h2>🎯 הגדרת עמלות למוצר</h2>
      <p>עמוד זה מאפשר להגדיר אחוזי עמלה מדויקים יותר לכל מוצר בחברות השונות.</p>
      <p>האחוזים המוגדרים כאן ישמשו כבסיס לחישובי עמלות בדף המרכז, בתיק הלקוח ובדוחות.</p>
      
      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/commissionProduct.png" alt="הגדרת עמלות" width={800} height={400} />

      <h2>⚠️ חשיבות ההגדרות</h2>
      <p>ככל שההגדרה מדויקת יותר (מוצר וחברה), כך הסכומים שיופיעו בדף המרכז, בתיק הלקוח ובדוחות יהיו נכונים יותר.</p>

      <HelpNavigation />
    </div>
  );
};

export default CommissionsHelp;
