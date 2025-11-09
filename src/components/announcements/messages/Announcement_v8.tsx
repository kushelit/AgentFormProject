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

        <h2 className="announcement-title">🆕 עדכון גרסה: השוואת עמלות בין טעינה ל-MagicSale</h2>
        <p className="announcement-badge">שינוי מיועד לבעלי מנוי עסקי</p>

        <p>
          כעת ניתן להשוות בין עמלות שהוזנו מקבצי הטעינה לבין העמלות שחושבו בפועל במערכת MagicSale.
        </p>

        <h3>📌 איפה תמצאו את זה?</h3>
<ul>
  <li>
    🔹 <strong>דף השוואות חדש</strong> – תחת ספריית <em>טעינת עמלות</em>:
    <ul>
      <li>השוואה ברמת סוכן</li>
      <li>השוואה ברמת חברה</li>
    </ul>
  </li>
  <li>
    🔹 <strong>דף הלקוחות</strong> – נוספה האפשרות להשוות עמלות ברמת הלקוח.
  </li>
</ul>

<div className="highlight-line">
  <span className="highlight-icon">💥</span>
  <strong>
    מעכשיו תוכלו לזהות בקלות פערים בין 
    <span className="highlight-text"> העמלות שאנחנו מצפים אליהן </span>
    לבין 
    <span className="highlight-text"> העמלות ששולמו בפועל על־ידי החברות.</span>
  </strong>
</div>

        <p className="announcement-footnote">
          למידע נוסף והסברים מפורטים, בקרו בדף ההדרכה במערכת או <a href="/support" onClick={onAcknowledge}>צרו קשר</a>.
        </p>

        <button className="acknowledge-button" onClick={onAcknowledge}>הבנתי</button>
      </div>
    </div>
  );
};

export default AnnouncementV8;
