import React from "react";
import Image from "next/image";
// import "./centralpage.css";
import "../HelpPages.css";
import HelpNavigation from "@/components/HelpNavigation/HelpNavigation";

const CentralPageHelp = () => {
  return (
    <div className="help-container">
      <h1>📖 דף מרכז</h1>

      <h2>📌 מבנה הדף</h2>
      <p>דף זה מציג תמונה כוללת ועדכנית של נתוני הסוכנות – פרמיות, עמלות ויעדים.</p>
      <p>הדף מחולק לשני חלקים מרכזיים:</p>

      <div className="cards-container">
        <div className="card">
          <div className="card-header">📊 סיכום פרמיות ועמלות</div>
          <div className="card-body">
            <p>בחלק העליון מוצגת טבלה המסכמת את הפעילות של הסוכנות לפי חודשים: סך פרמיות, עמלות היקף, ניוד כניסה ועוד.</p>
            <p>ניתן לבצע סינון נתונים לפי קריטריונים שונים כגון: שנה, סטטוס פוליסה, מוצר, חברה, עובדים ועוד.</p>
          </div>
        </div>

        <h3>📌 צילום מסך לדוגמה:</h3>
        <Image src="/static/img/centralpage.png" alt="תצוגת דף מרכז" width={1000} height={600} />

        <div className="card">
          <div className="card-header">
            <span className="emoji">📈</span>
            <span className="title">דוחות גרפיים</span>
          </div>
          <div className="card-body">
            <p>בחלק התחתון מוצגים דוחות גרפיים לפי בחירה:</p>

            <div className="cards-container">
              <div className="card">
                <div className="card-header">
                  <span className="emoji">🧍‍♂️</span>
                  <span className="title">לקוחות חדשים</span>
                </div>
                <div className="card-body">
                  <p>גרף הצגת מספר הלקוחות החדשים בסוכנות.</p>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="emoji">📈</span>
                  <span className="title">ממוצע נפרעים ללקוח</span>
                </div>
                <div className="card-body">
                  <p>גרף המציג ממוצע נפרעים ללקוח.</p>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="emoji">🏢</span>
                  <span className="title">סך היקף לחברה</span>
                </div>
                <div className="card-body">
                  <p>גרף המציג את היקף הפעילות הכוללת לכל חברה.</p>
                </div>
              </div>
            </div>

            <p>ניתן להחליף בין הדוחות באמצעות תפריט נפתח.</p>
          </div>
        </div>

        <h3>📌 צילום מסך לדוגמה:</h3>
        <Image src="/static/img/graphcustomer.png" alt="תצוגת דף מרכז" width={1000} height={600} />
      </div> {/* סוף cards-container */}

      <HelpNavigation />
    </div> /* סוף help-container */
  );
};

export default CentralPageHelp;
