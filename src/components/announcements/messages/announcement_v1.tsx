import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void; // חדש
}

const AnnouncementV1 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay">
      <div className="announcement-box">
      <button className="close-button" onClick={onClose}>✖</button>
        <h2 className="announcement-title">🚀 עיצוב חדש למערכת <strong>MagicSale</strong>!</h2>
        <p>כל המערכת עוצבה מחדש – קלילה, מודרנית ונוחה יותר לשימוש.</p>
        <ul>
          <li>✨ אפשרות מיון בכל השדות</li>
          <li>✏️ עריכה ומחיקה מהירה של רשומות</li>
          <li>💼 תהליך הזנת עסקה מהיר יותר</li>
          <li>🎯 מערכת יעדים מעודכנת</li>
          <li>📊 דוחות גרפיים מגוונים לפי שנה</li>
        </ul>
        <p><strong>📚 לכל השינויים תוכלו לעיין בדפי ההדרכה המלאים שנוספו.</strong></p>
        <p>❓ מצאתם בעיה? נשמח לעזור דרך טופס <a href="/support">צור קשר</a></p>
        <button className="acknowledge-button" onClick={onAcknowledge}>הבנתי</button>
      </div>
    </div>
  );
};

export default AnnouncementV1;
