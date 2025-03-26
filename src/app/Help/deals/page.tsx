import React from "react";
import Image from "next/image";
import './deals.css';
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const DealsHelp = () => {
  return (
    <div className="help-container">
      <h1>📖 ניהול עסקאות ועמידה ביעדים</h1>

      <h2>📊 עמידה ביעדים</h2>
      <p>עמוד זה מציג את היעדים שהוגדרו לכל עובד, את סטטוס העמידה ביעדים ואת התוקף שלהם.</p>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
  <span>היעדים המוצגים, הינם יעדים פעילים וניתן לבטל את הסימון</span>
  <Image src="/static/img/yaadpail.png" alt="יעדים פעילים" width={100} height={60} />
  <span>ולהציג גם יעדים שהסתיימו.</span>
</div>


      <ul>
        <li>🔹 סוכן רואה את היעדים שהוגדרו לכל הסוכנות.</li>
        <li>🔹 עובד רואה רק את היעדים של עצמו.</li>
      </ul>

      <Image src="/static/img/goalimg.png" alt="סטטוס יעדים" width={800} height={400} />

      <h2>📑 ניהול עסקאות</h2>

      <h3>📌  טבלת עסקאות :</h3>
      <Image src="/static/img/alldeals.png" alt="ניהול עסקאות" width={800} height={400} />


      <h3>תהליכים מרכזיים :</h3>

      <ul>
        <li>🔍 <strong>סינון עסקאות</strong> – ניתן לסנן לפי פרמטרים שונים.</li>
        <li style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
  <span>🔀 <strong>מיון עסקאות</strong> –  אפשר ללחוץ על כותרת ולמיין כל עמודה.</span>
  <Image src="/static/img/orderby.png" alt="מיון עסקאות" width={100} height={60} />
</li>
<li style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
  <span>➕ <strong>הוספת עסקה חדשה</strong> – באמצעות כפתור {"הוסף עסקה"}.</span>
  <Image src="/static/img/adddeal.png" alt="הוספת עסקה" width={100} height={60} />
</li>
        <li>✏️ <strong>עריכת עסקה</strong> – ניתן לערוך נתוני עסקה קיימת.</li>
        <li>❌ <strong>מחיקת עסקה</strong> – מחיקה סופית של עסקה.</li>
        <li style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
  <span>✏️❌ עריכה ומחיקה מתבצעים באמצעות הלחצן :</span>
  <Image src="/static/img/editdelete.png" alt="ערוך ומחק" width={100} height={60} />
</li>
<li style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
<span>💬 <strong>שדה הערות</strong> – מאפשר לצפות בטקסט המלא בחלונית באמצעות עמידה על השדה.</span>
<Image src="/static/img/notes.png" alt="הערות" width={200} height={100} />
</li>
      </ul>

      <h3>📌 טופס הזנת עסקה  :</h3>
      <Image src="/static/img/formdeal.png" alt="ניהול עסקאות" width={300} height={800} />

      <h2>⚠️ נקודות חשובות</h2>
      <ul>
        <li>⚠️   בעת הזנת תעודת זהות המשוייכת לסוכן, שם הלקוח יתמלא אוטומטית ביציאה מהשדה.</li>
        <li>⚠️ שדות הפרמיה משתנים דינמית בהתאם למוצר.</li>
        <li>⚠️  במידה ונדרש להזין מספר טפסים ברצף למבוטח, השתמש בכפתור <strong>הזן</strong>, כפתור זה יאפשר לך לשמור על שדות פרטי הלקוח מלאים.</li>
        <li>⚠️  בסיום לחץ על <strong>הזן וסיים</strong>.</li>
        <li>⚠️ בלחיצה על עריכת מוצר, מגיעים לטופס זה בסטאטוס עריכה.</li>

      </ul>

      <HelpNavigation />
    </div>
  );
};

export default DealsHelp;
