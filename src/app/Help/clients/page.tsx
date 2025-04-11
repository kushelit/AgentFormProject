import React from "react";
import Image from "next/image";
import "./clients.css";
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const ClientsHelp = () => {
  return (
    <div className="help-container">
      <h1>📖 ניהול לקוחות</h1>

      <h2>📋 טבלת הלקוחות</h2>
      <p>העמוד מציג את רשימת כל הלקוחות ומאפשר ביצוע פעולות שונות כמו סינון, מיון, עריכה ומחיקה.</p>

      <h3>📌 דוגמא לטבלת לקוחות:</h3>
      <Image src="/static/img/customers.png" alt="טבלת לקוחות" width={800} height={400} />

      <h2>🛠️ פעולות מרכזיות</h2>
      <div className="cards-container">
        <div className="card">
          <div className="card-header">🔍 <strong>סינון לקוחות</strong></div>
          <p>ניתן לסנן לפי פרמטרים שונים.</p>
        </div>
        <div className="card">
          <div className="card-header">🔀 <strong>מיון לקוחות</strong></div>
          <p>אפשר ללחוץ על כותרת ולמיין כל עמודה.</p>
        </div>
        <div className="card">
  <div className="card-header">✏️ <strong>עריכת לקוח</strong></div>
  <p>פתיחת השדות לעריכה, ובסיום יש ללחוץ על <strong>&quot;שמור שינויים&quot;</strong>.</p>
</div>
<div className="card">
  <div className="card-header">❌ <strong>ביטול שינויים</strong></div>
  <p>לחיצה על <strong>&quot;בטל&quot;</strong> תחזיר את הנתונים למצב המקורי.</p>
</div>
      </div>
      <h3>📌 דוגמא לתהליך עריכת איש קשר:</h3>
      <Image src="/static/img/editcustomer.png" alt="עריכת לקוח" width={800} height={100} />

      <h2>👨‍👩‍👦 קשרים משפחתיים</h2>
      <p>ניתן לנהל קשרים משפחתיים בין לקוחות בעזרת הכפתורים בתחתית הטבלה:</p>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">🔗 <strong>הוסף קשר משפחתי</strong></div>
          <p>
            מטרת הכפתור לקשר בין מספר מבוטחים לתא משפחתי אחד.<br />
            אופן השימוש: מסמנים את המבוטחים הרלוונטיים, לוחצים על הוסף קשר משפחתי, בוחרים מבוטח ראשי ומאשרים.
          </p>
          <Image src="/static/img/connectcustomers.png" alt="הוסף קשר משפחתי" width={800} height={400} />
        </div>
      </div>

      <h3>📌 בחירת מבוטח ראשי להוספת קשר משפחתי:</h3>
      <Image src="/static/img/maincustomer.png" alt="בחירת מבוטח ראשי" width={400} height={200} />

      <div className="cards-container">
        <div className="card">
          <div className="card-header">🗑️ <strong>נתק קשר משפחתי</strong></div>
          <p>ניתוק מבוטח או מספר מבוטחים מהמבוטח הראשי.</p>
        </div>
      </div>

      <h2>📊 תיק לקוח</h2>
      <p>המערכת מאפשרת לצפות בתיק לקוח עבור המבוטח הנבחר:</p>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">📄 <strong>דוח אישי</strong></div>
          <p>הצגת תיק לקוח של המבוטח שנבחר בטבלה.</p>
        </div>
        <div className="card">
          <div className="card-header">👨‍👩‍👦 <strong>דוח משפחתי</strong></div>
          <p>הצגת תיק לקוח לכל התא המשפחתי של המבוטח הנבחר.</p>
        </div>
      </div>

      <h3>📌 דוח אישי:</h3>
      <Image src="/static/img/privatedoch.png" alt="דוחות מבוטחים" width={800} height={200} />

      <h3>📌 דוח משפחתי:</h3>
      <Image src="/static/img/familydoch.png" alt="דוחות מבוטחים" width={800} height={400} />

      <HelpNavigation />
    </div>
  );
};

export default ClientsHelp;
