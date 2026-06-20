import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV19 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box compact">
        <button className="close-button" onClick={onClose}>✖</button>

        <div className="announcement-badge">
          חדש: בקרת עמלות
        </div>

        <h2 className="announcement-title">
          🚨 פוליסות חריגות
        </h2>

        <div className="announcement-hero">
          <div className="hero-card highlight">
            <div className="hero-icon">⚠️</div>
            <div>
              <div className="hero-title">
                כלי חדש לאיתור פוליסות הדורשות תחקור
              </div>
              <div className="hero-sub">
                מאתר באופן אוטומטי פוליסות עם עמלה חריגה.
              </div>
            </div>
          </div>
        </div>

        <p>
          במודול <strong>טעינת עמלות</strong>, במסך <strong>דף מסכם</strong>,
התווסף כפתור חדש <strong>&quot;פוליסות חריגות&quot;</strong>.
        </p>
        <div className="announcement-summary-list">
          <div className="summary-item">
            <span className="summary-icon">💰</span>
            <span>
              מציג פוליסות עם <strong>עמלה 0</strong> לצד פרמיה חיובית.
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-icon">📉</span>
            <span>
              מציג גם פוליסות עם <strong>עמלה שלילית</strong> לצד פרמיה חיובית.
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-icon">🔍</span>
            <span>
              מאפשר לזהות במהירות פוליסות הדורשות בדיקה ותחקור מול חברת הביטוח.
            </span>
          </div>
        </div>

        <div className="highlight-line">
          <span className="highlight-icon">✨</span>
          <span>
            <span className="highlight-text">חדש:</span>{" "}
            במקום לעבור ידנית על דוחות העמלות, המערכת מרכזת עבורך את כל
            הפוליסות החריגות בלחיצת כפתור.
          </span>
        </div>

        <button className="acknowledge-button" onClick={onAcknowledge}>
          הבנתי
        </button>
      </div>
    </div>
  );
};

export default AnnouncementV19;