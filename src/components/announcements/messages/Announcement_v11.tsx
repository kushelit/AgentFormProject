import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV11 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>

        <h2 className="announcement-title">✨ MagicSale - גרסה חדשה!</h2>
        <p>
          עדכון זה כולל שדרוג משמעותי בדף <strong>מסכם עמלות</strong> ותיקוני תקלות חשובים
          בתהליך טעינת הנתונים.
        </p>

        <h3>🔍 1. דף מסכם עמלות: Drill-down לפירוט פוליסות</h3>
        <p>
          נוספה אפשרות לבצע <strong>דריל דאון</strong> מתוך כל <strong>חודש דיווח</strong> של חברה,
          ולקבל <strong>פירוט פוליסות</strong> מלא שמרכיב את הסכומים בטבלה.
        </p>

        {/* ✅ מקום לתמונה */}
        <div className="announcement-image-placeholder">
           <img src="/static/img/commission-drilldown.png" alt="Drill-down מסכם עמלות" /> 
        </div>

        <h3>🛠️ 2. תיקוני תקלות ושיפורים</h3>
        <ul>
          <li>
            ✅ <strong>תיקון טעינת קובץ נפרעים – מגדל</strong>
          </li>
          <li>
            ✅ <strong>תיקון תקלות במחיקת טעינות</strong>
          </li>
        </ul>

        <p className="announcement-footnote">
          טיפ: בדף מסכם עמלות פשוט לחצו על חודש הדיווח / השורה הרלוונטית כדי להיכנס לפירוט.
        </p>

        <button className="acknowledge-button" onClick={onAcknowledge}>
          הבנתי
        </button>
      </div>
    </div>
  );
};

export default AnnouncementV11;
