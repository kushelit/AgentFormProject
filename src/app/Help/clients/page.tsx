import React from "react";
import Image from "next/image";
import './clients.css';
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const ClientsHelp = () => {
  return (
    <div className="help-container">
      <h1>📖 ניהול לקוחות</h1>

      <h2>📋 טבלת הלקוחות</h2>
      <p>העמוד מציג את רשימת כל הלקוחות ומאפשר ביצוע פעולות שונות כמו סינון, מיון, עריכה ומחיקה.</p>

      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/customers.png" alt="טבלת לקוחות" width={800} height={400} />

      <h2>🛠️ פעולות מרכזיות</h2>
      <ul>
        <li>🔍 <strong>סינון לקוחות</strong> – ניתן לסנן לפי פרמטרים שונים.</li>
        <li>🔀 <strong>מיון לקוחות</strong> – אפשר ללחוץ על כותרת ולמיין כל עמודה.</li>
        <li>✏️ <strong>עריכת לקוח</strong> – פותחת את השדות לעריכה, ובסיום יש ללחוץ על <strong>"שמור שינויים"</strong>.</li>
        <li>❌ <strong>ביטול שינויים</strong> – לחיצה על <strong>"בטל"</strong> תחזיר את הנתונים למצב המקורי.</li>
      </ul>

      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/editcustomer.png" alt="עריכת לקוח" width={800} height={100} />

      <h2>👨‍👩‍👦 קשרים משפחתיים</h2>
      <p>ניתן לנהל קשרים משפחתיים בין לקוחות בעזרת הכפתורים בתחתית הטבלה.</p>
      <ul>
      <li style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <span>🔗 <strong>הוסף קשר משפחתי</strong> – מטרת הכפתור לקשר בין מספר מבוטחים לתא משפחתי אחד. 
          אופן השימוש: מסמנים את המבוטחים הרלוונטיים, לוחצים על הוסף קשר משפחתי, בוחרים מבוטח ראשי ומאשרים את התהליך.</span>
          <Image src="/static/img/connectcustomers.png" alt="הוסף קשר משפחתי" width={800} height={400} />
        </li>  
        <h3>📌 בחירת מבוטח ראשי להוספת קשר משפחתי:</h3>
          <Image src="/static/img/maincustomer.png" alt="בחירת מבוטח ראשי" width={400} height={200} />      
        <li>🗑️ <strong>נתק קשר משפחתי</strong> – ניתוק מבוטח או מספר מבוטחים מהמבוטח הראשי.</li>
      </ul>

      <h2>📊 תיק לקוח</h2>
      <p>המערכת מאפשרת לצפות בתיק לקוח עבור המבוטח הנבחר.</p>
      <ul>
        <li>📄 <strong>דוח אישי</strong> – הצגת תיק לקוח של המבוטח שנבחר בטבלה.</li>
        <li>👨‍👩‍👦 <strong>דוח משפחתי</strong> – הצגת תיק לקוח לכל התא המשפחתי של המבוטח הנבחר.</li>
      </ul>

      <h3>📌 דוח אישי :</h3>
      <Image src="/static/img/privatedoch.png" alt="דוחות מבוטחים" width={800} height={200} />
      <h3>📌 דוח משפחתי :</h3>
      <Image src="/static/img/familydoch.png" alt="דוחות מבוטחים" width={800} height={400} />

      <HelpNavigation />
    </div>
  );
};

export default ClientsHelp;
