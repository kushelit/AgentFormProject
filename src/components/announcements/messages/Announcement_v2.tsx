import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV2 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>
        
        <h2 className="announcement-title">🚀 עדכון מערכת MagicSale - גרסה חדשה!</h2>

        <p>שמחים להודיע על שדרוגים ושיפורים במערכת:</p>
        <ul>
          <li>🛠️ <strong>תיקוני תקלות</strong> – חוויית עבודה מהירה ויציבה יותר.</li>
          <li>🧩 <strong>ניהול הרשאות עובדים</strong> – מעכשיו ניתן להעניק ולהגביל הרשאות לעובדים. 
            <a href="/Help/TeamPermissions" style={{ marginRight: '6px', color: '#007bff' }}>📚 למדריך המלא</a>
          </li>
          <li>👥 <strong>ניהול קבוצות סוכנים</strong> – עבודה חכמה עם קבוצות מוגדרות מראש.</li>
        </ul>

        <p><strong>📚 להסברים נוספים הוספנו דפי עזרה חדשים במערכת.</strong></p>
        <p>❓ יש לכם שאלות? פנו אלינו דרך טופס <a href="/support">צור קשר</a>.</p>

        <button className="acknowledge-button" onClick={onAcknowledge}>הבנתי</button>
      </div>
    </div>
  );
};

export default AnnouncementV2;
