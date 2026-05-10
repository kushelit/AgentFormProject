import React, { useState } from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV16 = ({ onAcknowledge, onClose }: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box expanded">
        <button className="close-button" onClick={onClose}>✖</button>

        <div className="announcement-badge">
          חדש: הרצה מרובה + קוד מהנייד + מסך עמלות חדש
        </div>

        <h2 className="announcement-title">
          🚀 MagicSale - גרסה חדשה!
        </h2>

        <div className="announcement-hero">
          <div className="hero-card highlight">
            <div className="hero-icon">⚡</div>
            <div className="hero-content">
              <div className="hero-title">
                הרצת מספר חברות יחד
              </div>
              <div className="hero-sub" style={{ fontWeight: 600 }}>
                בוחרים כמה חברות — והמערכת מריצה אותן ברצף
              </div>
              <div className="hero-note">
                פחות לחיצות, פחות המתנה, יותר אוטומציה
              </div>
            </div>
          </div>

          <div className="hero-card automation">
            <div className="hero-icon">📱</div>
            <div className="hero-content">
              <div className="hero-title">
                הזנת קוד אימות מהטלפון
              </div>
              <div className="hero-sub">
                ניתן להזין את קוד ה־SMS שמתקבל מחברת הביטוח ישירות מהנייד
              </div>
            </div>
          </div>

          <div className="hero-card">
            <div className="hero-icon">📋</div>
            <div className="hero-content">
              <div className="hero-title">
                מסך עמלות חדש
              </div>
              <div className="hero-sub">
                ניהול הסכמי עמלות בצורה ברורה, נוחה ומסודרת יותר
              </div>
            </div>
          </div>
        </div>

        {!isExpanded ? (
          <>
            <p>
              בגרסה זו הוספנו יכולות משמעותיות לאוטומציה, שדרגנו את חוויית
              העבודה עם קודי האימות, והשקנו מסך עמלות חדש שמקל מאוד על ניהול
              הסכמי הסוכן.
            </p>

            <div className="announcement-summary-list">
              <div className="summary-item">
                <span className="summary-icon">🏢</span>
                <span>נוספו הראל והכשרה לטעינה האוטומטית</span>
              </div>

              <div className="summary-item">
                <span className="summary-icon">⚡</span>
                <span>אפשרות להריץ מספר חברות יחד בלחיצה אחת</span>
              </div>

              <div className="summary-item">
                <span className="summary-icon">📱</span>
                <span>הזנת קוד האימות מהטלפון בזמן הרצה</span>
              </div>

              <div className="summary-item">
                <span className="summary-icon">📋</span>
                <span>מסך עמלות חדש וברור יותר לניהול הסכמים</span>
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
            <h3>🏢 חברות נוספות בטעינה האוטומטית</h3>
            <p>
              נוספה תמיכה בטעינה אוטומטית עבור <strong>הראל</strong> ו-
              <strong>הכשרה</strong>, בנוסף לחברות שכבר נתמכות במערכת.
            </p>

            <h3>⚡ הרצת מספר חברות יחד</h3>
            <p>
              אחת היכולות המשמעותיות בגרסה: ניתן לבחור מספר חברות ולהריץ אותן
              יחד בתהליך אחד מסודר.
            </p>

            <p>
              במקום להפעיל כל חברה בנפרד, MagicSale מריצה את החברות ברצף,
              מציגה את ההתקדמות, ומאפשרת עבודה מהירה ונוחה יותר מול טעינות
              העמלות החודשיות.
            </p>

            <ul>
              <li>בחירת מספר חברות להרצה</li>
              <li>ניהול תור ריצות מסודר</li>
              <li>מעקב אחר סטטוס כל חברה</li>
              <li>חיסכון משמעותי בזמן עבודה</li>
            </ul>

            <h3>📱 הזנת קוד אימות מהטלפון</h3>
            <p>
              בעת הרצה אוטומטית, כאשר מתקבל קוד SMS מחברת הביטוח, ניתן להזין
              את הקוד ישירות מהטלפון — בלי להישאר צמודים למסך המחשב.
            </p>

            <p>
              היכולת הזו מקלה במיוחד על הרצות חודשיות ומאפשרת להמשיך את
              התהליך גם כשלא נמצאים מול המחשב.
            </p>

         <h3>📋 מסך עמלות חדש!</h3>
<p>
  עלה מסך עמלות חדש שמקל מאוד על הזנת הסכמי העמלות ומשקף בצורה
  ברורה יותר את מבנה ההסכמים מול החברות.
</p>

<p>
  המסך החדש מאפשר לראות את ההסכמים בצורה מסודרת לפי תחומים,
  חברות וסוגי עמלות — ומקל על עדכון, בדיקה והשוואה.
</p>

<p>
  בנוסף, ניתן להוריד מהמערכת <strong>תבנית אקסל מסודרת</strong> של
  ההסכמים, לעדכן אותה בקלות, ולטעון בחזרה למערכת את קובץ האקסל עם
  ההסכמים המעודכנים.
</p>

<div className="highlight-line">
  <span className="highlight-icon">✨</span>
  <span>
    <span className="highlight-text">מומלץ להיכנס ולבדוק:</span>{" "}
    מסך העמלות החדש נבנה כדי להפוך את ניהול ההסכמים לפשוט, ברור ומהיר יותר.
  </span>
</div>
            <h3>👤 הפיכת ליד ללקוח</h3>
            <p>
              נוספה יכולת חדשה להפוך ליד ללקוח בצורה נוחה יותר, כחלק מהמשך
              שיפור תהליך העבודה מול לידים ולקוחות במערכת.
            </p>

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

export default AnnouncementV16;