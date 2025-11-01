import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV7 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>

        <h2 className="announcement-title">🆕 עדכון גרסה: שדרוגים במודול טעינת עמלות</h2>
        <p className="announcement-badge"> זמין למנויי מנוי עסקי  </p>

        <p>שדרגנו את מודול טעינת העמלות כדי לייעל את הבקרה והניתוח אצלכם.</p>

        <h3>📌 מה חדש?</h3>
        <ul>
          <li>
            <strong>דף השוואת עמלות</strong> – נוספו אפשרויות השוואה:
            <ul>
              <li>🔹 לפי תבנית (כמו קודם)</li>
              <li>🔹 לפי חברה (כל התבניות של החברה יחד)</li>
              <li>🔹 כל החברות יחד (השוואה רוחבית)</li>
            </ul>
          </li>
          <li>
            <strong>ספי סטיית תקן</strong> – הוספנו שדות לקביעת
            <em> סף סטייה בסכום העמלה (₪)</em> ו
            <em> סף סטייה באחוז שינוי</em>, כדי לסנן פערים שוליים ולהתמקד בשינויים מהותיים.
          </li>
          <li>
            <strong>דף סיכום עמלות</strong> – נוספו גרפים:
            <ul>
              <li>📊 נפרעים לפי חברה</li>
              <li>📈 נפרעים לפי חודש</li>
            </ul>
          </li>
        </ul>

        <p>המטרה: פחות רעש, יותר תובנות — ומהר.</p>

        <div className="announcement-actions">
          <a className="secondary-link" href="/reports/commissions/compare" onClick={onAcknowledge}>
            לפתיחת דף השוואת עמלות →
          </a>
          <a className="secondary-link" href="/reports/commissions/summary" onClick={onAcknowledge}>
            לפתיחת דף סיכום עמלות →
          </a>
        </div>

        <p className="announcement-footnote">
          צריך עזרה? <a href="/support" onClick={onAcknowledge}>צור קשר</a> או בקר/י בדפי העזרה במערכת.
        </p>

        <button className="acknowledge-button" onClick={onAcknowledge}>הבנתי</button>
      </div>
    </div>
  );
};

export default AnnouncementV7;
