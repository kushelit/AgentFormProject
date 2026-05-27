import React, { useState } from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV17 = ({ onAcknowledge, onClose }: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box expanded">
        <button className="close-button" onClick={onClose}>✖</button>

        <div className="announcement-badge">
          חדש: טעינת עמלות, מבט נפרעים ודוחות חדשים
        </div>

        <h2 className="announcement-title">
          🚀 MagicSale - גרסה חדשה!
        </h2>

        <div className="announcement-hero">
          <div className="hero-card highlight">
            <div className="hero-icon">📥</div>
            <div className="hero-content">
              <div className="hero-title">שדרוג מסך טעינת עמלות</div>
              <div className="hero-sub" style={{ fontWeight: 600 }}>
                שיפורים, תיקונים ותמיכה בטעינת ילין לפידות
              </div>
              <div className="hero-note">
                יותר שליטה ונוחות בתהליך הטעינה
              </div>
            </div>
          </div>

          <div className="hero-card automation">
            <div className="hero-icon">📊</div>
            <div className="hero-content">
              <div className="hero-title">מבט לפי תאריך פרסום דוחות</div>
              <div className="hero-sub">
                הבנה ברורה של סכום הנפרעים שנכנס בכל חודש
              </div>
            </div>
          </div>

          <div className="hero-card">
            <div className="hero-icon">👥</div>
            <div className="hero-content">
              <div className="hero-title">הקמת לקוחות מקבצי נפרעים</div>
              <div className="hero-sub">
                יצירת לקוחות לצורך קשרים משפחתיים ומבט משפחתי
              </div>
            </div>
          </div>
        </div>

        {!isExpanded ? (
          <>
            <p>
              בגרסה זו התמקדנו בשיפור תהליך טעינת העמלות, הרחבת מבטי הניתוח
              והוספת כלים חדשים לעבודה עם נתוני נפרעים ברמת לקוח, פוליסה ותא משפחתי.
            </p>

            <div className="announcement-summary-list">
              <div className="summary-item">
                <span className="summary-icon">📥</span>
                <span>שיפורים ותיקונים במסך טעינת עמלות</span>
              </div>

              <div className="summary-item">
                <span className="summary-icon">🏦</span>
                <span>הוספת טעינה לילין לפידות</span>
              </div>

              <div className="summary-item">
                <span className="summary-icon">🗑️</span>
                <span>אפשרות למחיקת טעינה אוטומטית באופן עצמאי</span>
              </div>

              <div className="summary-item">
                <span className="summary-icon">📊</span>
                <span>מבט חדש לפי תאריך פרסום הדוחות</span>
              </div>

              <div className="summary-item">
                <span className="summary-icon">📑</span>
                <span>דוח נפרעים מטעינה לפי לקוח, פוליסה ותא משפחתי</span>
              </div>
            </div>

            <div className="announcement-actions">
              <button
                className="secondary-button"
                onClick={() => setIsExpanded(true)}
              >
                קרא עוד
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>📥 מסך טעינת עמלות</h3>
            <p>
              בוצעו שיפורים ותיקונים במסך טעינת העמלות, במטרה להפוך את תהליך
              הטעינה ליציב, ברור ונוח יותר לעבודה שוטפת.
            </p>

            <ul>
              <li>שיפורים ותיקונים בתהליך טעינת קבצי העמלות</li>
              <li>הוספת תמיכה בטעינה של <strong>ילין לפידות</strong></li>
              <li>אפשרות למחיקת טעינה אוטומטית באופן עצמאי מתוך המערכת</li>
            </ul>

            <h3>📊 דף מסכם עמלות</h3>
            <p>
              התווסף מבט מסכם חדש לפי תאריך פרסום הדוחות.
            </p>

            <p>
              המבט החדש מאפשר להבין בצורה ברורה יותר מהו סכום הנפרעים שנכנס
              בכל חודש, לפי מועד פרסום הדוחות בפועל.
            </p>

            <div className="highlight-line">
              <span className="highlight-icon">✨</span>
              <span>
                <span className="highlight-text">חדש:</span>{" "}
                מבט לפי תאריך פרסום הדוחות מסייע להבין את תזרים הנפרעים
                החודשי בצורה מדויקת וברורה יותר.
              </span>
            </div>

            <h3>👥 מסך לקוחות</h3>
            <p>
              נוספה אפשרות להקים לקוחות מתוך קבצי הנפרעים.
            </p>

            <p>
              חשוב לשים לב: פעולה זו <strong>אינה מקימה עסקאות</strong>.
              המטרה היא לאפשר יצירת קשרים משפחתיים ולייצר מבט משפחתי רחב יותר
              גם על בסיס נתוני הנפרעים.
            </p>

            <h3>📑 דוחות</h3>
            <p>
              התווסף דוח חדש: <strong>דוח נפרעים מטעינה</strong>.
            </p>

            <p>
              הדוח מאפשר ניתוח ובקרה של נתוני הנפרעים ברמות שונות:
            </p>

            <ul>
              <li>ברמת לקוח</li>
              <li>ברמת פוליסה</li>
              <li>ברמת תא משפחתי</li>
            </ul>

            <div className="announcement-actions">
              <button
                className="secondary-button"
                onClick={() => setIsExpanded(false)}
              >
                חזרה לתקציר
              </button>
            </div>
          </>
        )}

        <button className="acknowledge-button" onClick={onAcknowledge}>
          הבנתי
        </button>
      </div>
    </div>
  );
};

export default AnnouncementV17;