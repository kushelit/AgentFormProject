import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV10 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>

        <h2 className="announcement-title">✨ MagicSale - גרסה חדשה!</h2>
        <p>
          העדכון הנוכחי כולל גרפים חדשים בדף המרכז, דוחות חדשים לעבודה עם מקורות ליד,
          ואפשרות שדרוג מנוי למנוי מקצועי הכולל את מודול טעינת העמלות.
        </p>

        <h3>📊 1. דף מרכז: גרפים חדשים</h3>
        <ul>
          <li>🔹 <strong>רווחיות לפי מקור ליד</strong></li>
          <li>🔹 <strong>נפרעים – השוואה לשנה קודמת</strong></li>
          <li>🔹 <strong>היקף – השוואה לשנה קודמת</strong></li>
        </ul>

        <h3>📄 2. מערכת הדוחות: דוחות חדשים למקורות ליד</h3>
        <ul>
          <li>
            🔹 <strong>דוח רווחיות לפי מקור ליד (לסוכן)</strong> – מציג רווחיות ממקור הליד
            <strong> עם</strong> ו<strong>ללא</strong> פיצול עמלות
          </li>
          <li>
            🔹 <strong>דוח למקור ליד</strong> – מציג את הרווחיות של <strong>מקור הליד עצמו</strong>
          </li>
        </ul>

        <h3>⬆️ 3. שדרוג מנוי למנוי מקצועי</h3>
        <p>
          נוספה אפשרות לסוכנים לשדרג את המנוי ל<strong>מנוי מקצועי</strong>, הכולל בתוכו את
          <strong> מודול טעינת העמלות</strong>.
        </p>
        <p>
          כדי לשדרג מנוי:
          <br />
          לחצו על <strong>שם המשתמש</strong> בסרגל העליון, ובחרו: <strong>{"<שנה תוכנית>"}</strong>
        </p>

        <p className="announcement-footnote">
          למידע נוסף והסברים מפורטים, בקרו בדפי ההדרכה:
          <br />
          <a
            href="/Help/commission-import"
            onClick={onAcknowledge}
            className="help-link"
          >
            פתיחת דף ההדרכה למודול טעינת עמלות →
          </a>
        </p>

        <button className="acknowledge-button" onClick={onAcknowledge}>
          הבנתי
        </button>
      </div>
    </div>
  );
};

export default AnnouncementV10;
