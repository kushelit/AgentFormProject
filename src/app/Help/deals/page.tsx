import React from "react";
import Image from "next/image";
import "../HelpPages.css";
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const DealsHelp = () => {
  return (
    <div className="help-container">
      <h1>📖 ניהול עסקאות ועמידה ביעדים</h1>

      <h2>📊 עמידה ביעדים</h2>
      <p>עמוד זה מציג את היעדים שהוגדרו לכל עובד, את סטטוס העמידה ביעדים ואת התוקף שלהם.</p>

      <div className="inline-image-text">
      <Image src="/static/img/yaadpail.png" alt="יעדים פעילים" width={100} height={60} />
        <p>היעדים המוצגים הינם יעדים פעילים וניתן לבטל את הסימון ולהציג גם יעדים שהסתיימו </p>
      </div>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">🔹 סוכן</div>
          <p>רואה את היעדים שהוגדרו לכל הסוכנות.</p>
        </div>
        <div className="card">
          <div className="card-header">🔹 עובד</div>
          <p>רואה רק את היעדים של עצמו.</p>
        </div>
      </div>

      <Image src="/static/img/goalimg.png" alt="סטטוס יעדים" width={800} height={400} />

      <h2>📑 ניהול עסקאות</h2>

      <h3>📌 טבלת עסקאות:</h3>
      <Image src="/static/img/alldeals.png" alt="טבלת עסקאות" width={800} height={400} />

      <h3>📌 תהליכים מרכזיים:</h3>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">🔍 סינון עסקאות</div>
          <p>ניתן לסנן לפי פרמטרים שונים.</p>
        </div>

        <div className="card">
          <div className="card-header">🔀 מיון עסקאות</div>
          <div className="inline-image-text">
          <Image src="/static/img/orderby.png" alt="מיון עסקאות" width={100} height={60} />
            <p>ניתן ללחוץ על כותרת ולמיין כל עמודה </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">➕ הוספת עסקה חדשה</div>
          <div className="inline-image-text">
  <Image src="/static/img/adddeal.png" alt="הוספת עסקה" width={100} height={60} />
  <p>באמצעות לחיצה על כפתור &quot;הוסף עסקה&quot;</p>
</div>
        </div>

        <div className="card">
          <div className="card-header">✏️ עריכת עסקה</div>
          <p>ניתן לערוך נתוני עסקה קיימת.</p>
        </div>

        <div className="card">
          <div className="card-header">❌ מחיקת עסקה</div>
          <p>מחיקה סופית של עסקה.</p>
        </div>

        <div className="card">
          <div className="card-header">✏️❌ עריכה ומחיקה</div>
          <div className="inline-image-text">
          <Image src="/static/img/editdelete.png" alt="עריכה ומחיקה" width={100} height={60} />
            <p>עריכה ומחיקה מתבצעים באמצעות הלחצן: </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">💬 שדה הערות</div>
          <div className="inline-image-text">
          <Image src="/static/img/notes.png" alt="הערות" width={200} height={100} />
            <p>מאפשר לצפות בטקסט המלא בחלונית באמצעות עמידה על השדה </p>
          </div>
        </div>
      </div>

      <h3>📌 טופס הזנת עסקה:</h3>
      <Image src="/static/img/formdeal.png" alt="טופס הזנת עסקה" width={300} height={800} />
      <h2>⚠️ נקודות חשובות</h2>
      <ul>
  <li className="bullet-with-icon">
    <span className="icon">⚠️</span>
    <span className="text">בעת הזנת תעודת זהות המשויכת לסוכן, שם הלקוח יתמלא אוטומטית ביציאה מהשדה.</span>
  </li>
  <li className="bullet-with-icon">
    <span className="icon">⚠️</span>
    <span className="text">שדות הפרמיה משתנים דינמית בהתאם למוצר.</span>
  </li>
  <li className="bullet-with-icon">
    <span className="icon">⚠️</span>
    <span className="text">במידה ונדרש להזין מספר טפסים ברצף למבוטח, השתמש בכפתור <strong>הזן</strong> לשמירת פרטי הלקוח.</span>
  </li>
  <li className="bullet-with-icon">
    <span className="icon">⚠️</span>
    <span className="text">בסיום לחץ על <strong>הזן וסיים</strong>.</span>
  </li>
  <li className="bullet-with-icon">
    <span className="icon">⚠️</span>
    <span className="text">בלחיצה על <strong>עריכת עסקה</strong>, מגיעים לטופס זה במצב עריכה.</span>
  </li>
</ul>
      <HelpNavigation />
    </div>
  );
};

export default DealsHelp;
