import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV3 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>

        <h2 className="announcement-title">🚀 עדכון מערכת MagicSale - גרסה חדשה!</h2>

        <p>שמחים לעדכן אתכם בשדרוגים האחרונים:</p>
        <ul>
          <li>📤 <strong>ייצוא לאקסל של עסקאות</strong> – ניתן לסנן ולייצא את הרשימה לפי הצורך.</li>
          <li>⛔ <strong>אפשרות הפיכת משתמש ללא פעיל</strong> – כולל חסימת כניסה למערכת.</li>
          <li>🛠️ <strong>תיקוני תקלות</strong> – שיפורים ליציבות וביצועים טובים יותר.</li>
        </ul>

        <p><strong>📚 להסברים נוספים הוספנו דפי עזרה חדשים במערכת.</strong></p>
        <p>❓ יש לכם שאלות? פנו אלינו דרך טופס <a href="/support">צור קשר</a>.</p>

        <button className="acknowledge-button" onClick={onAcknowledge}>הבנתי</button>
      </div>
    </div>
  );
};

export default AnnouncementV3;
