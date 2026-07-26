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
          חדש: שיפורים במודול העמלות
        </div>

        <h2 className="announcement-title">
          ✨ שיפורים חדשים ב-MagicSale
        </h2>

        <div className="announcement-hero">
          <div className="hero-card highlight">
            <div className="hero-icon">📊</div>

            <div>
              <div className="hero-title">
                מודול טעינת העמלות ממשיך להשתדרג
              </div>

              <div className="hero-sub">
                יכולות חדשות לניהול עמלות והתאמה אישית של סביבת העבודה.
              </div>
            </div>
          </div>
        </div>

        <p>
          הרחבנו את מודול <strong>טעינת העמלות</strong> והוספנו יכולות חדשות,
          המאפשרות עבודה נוחה, מהירה ומדויקת יותר.
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

          <div className="summary-item">
            <span className="summary-icon">📦</span>
            <span>
              נוספה אפשרות לבחור <strong>מוצרי ברירת מחדל</strong> דרך
              <strong> גלגל ההגדרות → בחירת מוצרים</strong>, בדומה לבחירת
              החברות.
            </span>
          </div>
        </div>

        <div className="highlight-line">
          <span className="highlight-icon">✨</span>

          <span>
            <span className="highlight-text">חדש:</span>{" "}
            טעינת העמלות הפכה גמישה ומתקדמת יותר, עם תמיכה בבתי סוכן, קליטה
            מוקדמת של בתי השקעות ואפשרות להתאים את רשימת המוצרים לעבודה
            היומיומית.
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