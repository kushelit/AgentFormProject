import React from "react";
import Image from "next/image";
import "../HelpPages.css";
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const TeamPermissions = () => {
  return (
    <div className="help-container">
      <h1>📖 ניהול הרשאות עובדים</h1>

      <h2>🔐 מה כולל עמוד ניהול ההרשאות?</h2>
      <p>
        עמוד ניהול ההרשאות נועד לאפשר לסוכן לצפות ולעדכן את ההרשאות שלו ושל עובדיו. 
        ניתן להוסיף או להסיר הרשאות בצורה פשוטה וישירה.
      </p>

      <div className="image-text-vertical">
      <Image src="/static/img/permissions.png" alt="טבלת הרשאות" width={400} height={200} />
      <p style={{ marginBottom: "20px" }}>
  <strong>הטבלה מציגה את העובדים ואת ההרשאות השונות לכל עובד.</strong>
</p>
      </div>
      <h3>⚠️ סימון הרשאות</h3>
<ul>
  <li>סימון ה-✅ מופיע כאשר ההרשאה מאושרת.</li>
  <li>סימון ה-❌ מופיע כאשר ההרשאה לא קיימת.</li>
</ul>
      <h2>⚠️ טיפול בהרשאות רגישות</h2>
      <div className="cards-container">
        <div className="card">
          <p>
            הרשאות רגישות, כמו <strong>צפייה בשדות עמלות</strong>, מוצגות בטבלה בצורה מודגשת וצבועה שונה לציון חשיבותן.
          </p>
        </div>

        <div className="card">
          <div className="card-header">🛡️ בקשת אישור בהרשאות רגישות</div>
          <p>
            בעת ניסיון להעניק או להסיר הרשאה רגישה, יופיע חלון אישור נוסף לבחירה מודעת לפני עדכון ההרשאה.
          </p>
        </div>
        <div className="card">
        <div className="card-header">📌 הרשאת "סטטוס משתמש"</div>
        <p>
           הרשאה  בשם <strong>"סטטוס משתמש"</strong> מאפשרת לצפות ולעדכן את סטטוס הפעילות של כל עובד.
        </p>
        <ul style={{ paddingRight: '20px' }}>
          <li>🟢 עובד חדש שנוסף למערכת מוקם אוטומטית כ<strong>פעיל</strong>.</li>
          <li>🔴 ניתן לעדכן את העובד כ<strong>לא פעיל</strong> במידה והסתיים שיתוף הפעולה איתו.</li>
          <li>⚙️ שינוי הסטטוס נעשה דרך עמוד ניהול ההרשאות, אם קיימת הרשאה מתאימה.</li>
        </ul>
      </div>
        <div className="card">
          <div className="card-header"> הגבלות עריכה של הרשאות</div>
          <p>
          🚫 ישנן הרשאות אשר ניתנות לעריכה על ידי אדמינים בלבד. סוכנים יכולים לצפות בהרשאות אך אינם יכולים לעדכן הרשאות אלו.
          </p>
        </div>
      </div>

      <h2>📋 הערות נוספות</h2>
      <ul>
        <li className="bullet-with-icon">
          <span className="icon">🔄</span>
          <span className="text">כל עדכון נשמר ישירות במסד הנתונים ומיושם מיידית.</span>
        </li>
        <li className="bullet-with-icon">
          <span className="icon">👥</span>
          <span className="text">סוכנים יכולים לראות ולעדכן הרשאות רק של העובדים המשויכים אליהם.</span>
        </li>
      </ul>

      <HelpNavigation />
    </div>
  );
};

export default TeamPermissions;
