import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV20 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box compact">
        <button className="close-button" onClick={onClose}>
          ✖
        </button>

        <div className="announcement-badge">
          חדש: שיפורים בטעינת עמלות
        </div>

        <h2 className="announcement-title">
          ✨ טעינת עמלות מתקדמת וגמישה יותר
        </h2>

        <div className="announcement-hero">
          <div className="hero-card highlight">
            <div className="hero-icon">📊</div>

            <div>
              <div className="hero-title">
                שיפורים חדשים במודול טעינת העמלות
              </div>

              <div className="hero-sub">
                תהליך טעינה רחב, גמיש ונוח יותר עבור סוכנים ובתי סוכן.
              </div>
            </div>
          </div>
        </div>

        <p>
          הרחבנו את מודול <strong>טעינת העמלות</strong> והוספנו אפשרויות
          חדשות, המאפשרות לנהל את קליטת העמלות בצורה מדויקת ונוחה יותר.
        </p>

        <div className="announcement-summary-list">
          <div className="summary-item">
            <span className="summary-icon">⚙️</span>

            <span>
              בוצעו <strong>שיפורים בתהליך טעינת העמלות</strong>, לשיפור
              חוויית העבודה וקליטת הנתונים במערכת.
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-icon">🏢</span>

            <span>
              נוספה אפשרות לטעון עמלות עבור <strong>בית סוכן</strong>, בנוסף
              לטעינת עמלות עבור סוכן בודד.
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-icon">📥</span>

            <span>
              נוספה אפשרות ל<strong>קליטה מוקדמת של קבצי בתי השקעות</strong>,
              כחלק מתהליך טעינת העמלות.
            </span>
          </div>
        </div>

        <div className="highlight-line">
          <span className="highlight-icon">✨</span>

          <span>
            <span className="highlight-text">חדש:</span>{" "}
            ניתן לנהל טעינות עמלות גם ברמת בית הסוכן ולהתחיל את קליטת קבצי
            בתי ההשקעות מוקדם יותר ובצורה מסודרת.
          </span>
        </div>

        <button
          className="acknowledge-button"
          onClick={onAcknowledge}
        >
          הבנתי
        </button>
      </div>
    </div>
  );
};

export default AnnouncementV20;