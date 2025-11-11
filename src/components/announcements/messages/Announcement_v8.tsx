import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV8 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>

        <h2 className="announcement-title">✨ MagicSale - גרסה חדשה!</h2>
        <p className="announcement-badge">שינוי מיועד לבעלי מנוי עסקי</p>

        <p>
          העדכון הנוכחי כולל שדרוגים משמעותיים במודול טעינת העמלות:
          השוואת עמלות בין טעינה ל-MagicSale, דוח נפרעים חדש,
          ותוספת דוחות לחברות נוספות.
        </p>

        <h3>📊 השוואת עמלות בין טעינה ל-MagicSale</h3>
        <ul>
          <li>
            🔹 <strong>דף השוואה לעמלה בפועל</strong> – תחת ספריית <em>טעינת עמלות</em>:
            <ul>
              <li> מאפשר השוואה בין עמלות שהתקבלו בפועל לבין עמלות במערכת</li>
            </ul>
          </li>
          <li>
            🔹 <strong>עדכון בדף הלקוחות</strong> – נוספה אפשרות להשוואת עמלות ברמת הלקוח.
          </li>
        </ul>

        <h3>📄 דוח חדש: נפרעים ללקוח – קובץ מול MagicSale</h3>
        <p>
           מאפשר להשוות בין סכומי <strong>נפרעים מהקבצים שנטענו </strong>
          לבין סכומי <strong>נפרעים המחושבים ב-MagicSale</strong>,
        </p>
        <h3>📑בדף <strong>טעינת העמלות</strong> נוספו דוחות חדשים לחברות נוספות:
        </h3>
    
        <div className="company-tags">
          <span>🏢 אנליסט</span>
          <span>🏢 אילון</span>
          <span>🏢 מור</span>
          <span>🏢 מיטב דש</span>
        </div>
   
        <div className="highlight-line">
          <span className="highlight-icon">💥</span>
          <strong>
            מעכשיו תוכלו לזהות בקלות פערים בין 
            <span className="highlight-text"> העמלות שאנחנו מצפים אליהן </span>
            לבין 
            <span className="highlight-text"> העמלות ששולמו בפועל על-ידי החברות.</span>
          </strong>
        </div>


        <p className="announcement-footnote">
          למידע נוסף והסברים מפורטים, בקרו בדף ההדרכה:
          <br />
          <a 
            href="/Help/commission-import"
            onClick={onAcknowledge}
            className="help-link"
          >
            פתיחת דף ההדרכה למודול טעינת עמלות →
          </a>
        </p>

        <button className="acknowledge-button" onClick={onAcknowledge}>הבנתי</button>
      </div>
    </div>
  );
};

export default AnnouncementV8;
