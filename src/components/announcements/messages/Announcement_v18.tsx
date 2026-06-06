import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV18 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box compact">
        <button className="close-button" onClick={onClose}>✖</button>

        <div className="announcement-badge">
          חדש: בחירת חברות מועדפות
        </div>

        <h2 className="announcement-title">
          ✨ פיצ׳ר חדש ב-MagicSale
        </h2>

        <div className="announcement-hero">
          <div className="hero-card highlight">
            <div className="hero-icon">🏢</div>
            <div>
              <div className="hero-title">בחירת חברות לעבודה במערכת</div>
              <div className="hero-sub">
                ניתן לצמצם את רשימת החברות שמופיעות במסכים השונים.
              </div>
            </div>
          </div>
        </div>

        <p>
          מעכשיו ניתן לבחור אילו חברות יוצגו לשימוש במערכת, כך שהעבודה תהיה
          ממוקדת ונוחה יותר.
        </p>

        <div className="announcement-summary-list">
          <div className="summary-item">
            <span className="summary-icon">⚙️</span>
            <span>
              נכנסים לגלגל ההגדרות בסרגל העליון
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-icon">🏢</span>
            <span>
              בוחרים באפשרות <strong>בחירת חברות</strong>
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-icon">✅</span>
            <span>
              מסמנים את החברות שרוצים שיופיעו במערכת ושומרים
            </span>
          </div>
        </div>

        <button className="acknowledge-button" onClick={onAcknowledge}>
          הבנתי
        </button>
      </div>
    </div>
  );
};

export default AnnouncementV18;