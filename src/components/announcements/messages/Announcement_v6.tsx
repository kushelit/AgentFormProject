import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV6 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>

        <h2 className="announcement-title">📊 מודול הדוחות החדש עלה לאוויר!</h2>

<p>שמחים להציג את מודול הדוחות החדש שנועד לייעל ולשדרג את העבודה שלכם כסוכני ביטוח.</p>

<p>המערכת כוללת כעת 4 דוחות חשובים:</p>
<ul>
  <li>📄 דוח פרמיית ביטוח ללקוח</li>
  <li>📁 דוח עסקאות לתקופה</li>
  <li>🧾 דוח נפרעים לפי לקוח</li>
  <li>📈 דוח צבירה פיננסית ללקוח</li>
</ul>

<p>✨ כל דוח מאפשר סינון לפי: 📅 תאריכים | 🏢 חברה | 🛍️ מוצר | 📌 סטאטוס פוליסה | 👤 מינוי סוכן</p>

<p>📬 הדוח נשלח אוטומטית למייל של הסוכן.</p>

<p>🎯 הדוחות ברמת הלקוח ומאפשרים לנתח ולדייק את השירות בהתאם לצרכים האמיתיים של כל מבוטח.</p>

<p>🕒 חיסכון בזמן | ✍️ שיפור ביעילות | 💡 קבלת החלטות טובה יותר</p>

<p><strong>📚 למידע נוסף, בקרו בדפי העזרה החדשים במערכת.</strong></p>
<p>❓ יש שאלות? <a href="/support">צור קשר</a></p>

        <button className="acknowledge-button" onClick={onAcknowledge}>הבנתי</button>
      </div>
    </div>
  );
};

export default AnnouncementV6;
