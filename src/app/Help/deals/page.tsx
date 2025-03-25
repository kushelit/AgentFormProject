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
      <p>העמוד מציג יעדים פעילים וניתן לבטל את הסימון ולהציג גם יעדים שהסתיימו</p>

      <ul>
        <li>🔹 סוכן רואה את היעדים של עצמו ושל העובדים הכפופים אליו.</li>
        <li>🔹 עובד רואה רק את היעדים של עצמו.</li>
      </ul>

      {/* <h3>📌 צילום מסך להמחשה:</h3> */}
      <Image src="/static/img/goalimg.png" alt="סטטוס יעדים" width={800} height={400} />

      <h2>📑 ניהול עסקאות</h2>
      <p>העמוד מציג רשימת עסקאות ומאפשר:</p>
      <ul>
        <li>🔍 <strong>סינון עסקאות</strong> – ניתן לסנן לפי פרמטרים שונים.</li>
        <li>🔀 <strong>מיון עסקאות</strong> – אפשר ללחוץ על כותרת ולמיין.</li>
        <li>➕ <strong>הוספת עסקה חדשה</strong> – באמצעות כפתור "הוסף עסקה".</li>
        <li>✏️ <strong>עריכת עסקה</strong> – ניתן לערוך נתוני עסקה קיימת.</li>
        <li>❌ <strong>מחיקת עסקה</strong> – מחיקה סופית של עסקה.</li>
      </ul>

      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/deals.png" alt="ניהול עסקאות" width={800} height={400} />

      <h2>🛠️ תהליכים מרכזיים נוספים</h2>
      <ul>
        <li>🔹 <strong>סינון עסקאות</strong> – באמצעות השדות השונים בראש הטבלה.</li>
        <li>🔹 <strong>מיון עסקאות</strong> – בלחיצה על כותרות העמודות.</li>
        <li>🔹 <strong>הוספת עסקה חדשה</strong> – באמצעות כפתור "הוסף עסקה".</li>
        <li>🔹 <strong>עריכת עסקה קיימת</strong> – באמצעות כפתור עריכה בעסקה נבחרת.</li>
        <li>🔹 <strong>מחיקת עסקה</strong> – בלחיצה על כפתור מחיקה (מותנה בהרשאות).</li>
      </ul>

      <h2>⚠️ נקודות חשובות</h2>
      <ul>
        <li>⚠️ מחיקת עסקה היא פעולה בלתי הפיכה.</li>
        <li>⚠️ יש לוודא שהסינון הנבחר מתאים כדי להציג את כל העסקאות הרלוונטיות.</li>
        <li>⚠️ עריכת עסקה אפשרית רק למשתמשים עם הרשאות מתאימות.</li>
      </ul>

      <h3>📌 צילום מסך להמחשה:</h3>
      <Image src="/static/img/goalimg.png" alt="סינון ומיון עסקאות" width={800} height={400} />

      {/* 🔗 הוספת הניווט לעמודים נוספים */}
      <HelpNavigation />
    </div>
  );
};

export default DealsHelp;