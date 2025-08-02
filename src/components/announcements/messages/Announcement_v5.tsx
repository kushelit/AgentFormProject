import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV5 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>

        <h2 className="announcement-title">✨ עדכון מערכת MagicSale - גרסה חדשה!</h2>

        <p>שמחים לעדכן אתכם בשדרוגים הבאים:</p>
        <ul>
          <li>👥 <strong>הוספת עובד ישירות מדף ניהול ההרשאות</strong> – כעת ניתן לצרף עובד חדש בצורה פשוטה ונוחה מתוך דף ההרשאות.</li>
          <li>🌐 <strong>אתר חדש עלה לאוויר!</strong> – מוזמנים לבקר <a href="https://www.magicsale.co.il/landing" target="_blank" rel="noopener noreferrer">באתר החדש שלנו</a> ולהתרשם מהאפשרות להתחברות והרשמה לסוכנים חדשים.</li>
        </ul>

        <p><strong>🔎 בקרוב נעדכן יכולות נוספות – שווה להישאר מעודכנים!</strong></p>
        <p>💬 יש לכם שאלה? פנו אלינו דרך טופס <a href="/support">צור קשר</a>.</p>

        <button className="acknowledge-button" onClick={onAcknowledge}>הבנתי</button>
      </div>
    </div>
  );
};

export default AnnouncementV5;
