import React, { useState } from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV15 = ({ onAcknowledge, onClose }: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>

        <div className="announcement-badge">
          חדש: הרחבת אוטומציה + דשבורד טעינות מתקדם
        </div>

        <h2 className="announcement-title">
          🚀 MagicSale - גרסה חדשה!
        </h2>

        {/* 🔥 HERO */}
        <div className="announcement-hero">
         <div className="hero-card highlight">
  <div className="hero-icon">🏢</div>
  <div className="hero-content">
    
    <div className="hero-title">
      נוספו חברות חדשות לאוטומציה 🎉
    </div>

    <div className="hero-sub" style={{ fontWeight: 600 }}>
      מיטב · מור · איילון · אנליסט · אלטשולר
    </div>

    <div className="hero-note">
      זמינות כעת להורדה אוטומטית מלאה
    </div>

  </div>
</div>
          <div className="hero-card">
            <div className="hero-icon">📊</div>
            <div className="hero-content">
              <div className="hero-title">
                דשבורד טעינות חדש
              </div>
              <div className="hero-sub">
                שליטה מלאה על סטטוס הטעינות החודשיות
              </div>
            </div>
          </div>

        </div>

        {/* תקציר */}
        {!isExpanded ? (
          <>
            <p>
              בגרסה זו הרחבנו משמעותית את יכולות האוטומציה במערכת,
              והוספנו דשבורד חדש לניהול ובקרה על טעינות העמלות.
            </p>

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
            {/* פירוט */}

            <h3>🤖 הרחבת תשתית הורדת הדוחות האוטומטית</h3>
            <p>
              תשתית האוטומציה שודרגה משמעותית וכעת מאפשרת עבודה יציבה ורחבה יותר
              מול מספר גדול יותר של חברות.
            </p>

            <h3>🏢 הוספת חברות חדשות לאוטומציה</h3>
            <p>
              נוספה תמיכה אוטומטית מלאה בחברות:
              <strong> מיטב</strong>, <strong>מור</strong>, <strong>איילון</strong>,
              <strong> אנליסט</strong> ו-<strong>אלטשולר</strong>,
              בנוסף לחברות שכבר נתמכו במערכת.
            </p>

            <h3>📊 דשבורד חדש למסך טעינת עמלות</h3>
            <p>
              מסך טעינת העמלות שודרג ומציג כעת <strong>דשבורד חודשי מתקדם</strong>,
              המאפשר לראות בצורה ברורה:
            </p>

            <ul>
              <li>אילו חברות זמינות לטעינה</li>
              <li>אילו חברות כבר נטענו</li>
              <li>סטטוס טעינה (הצלחה / שגיאה / בתהליך)</li>
              <li>אפשרות לריצה חוזרת</li>
              <li>שליטה ובקרה מלאה על כל החודש</li>
            </ul>

            <p>
              הדשבורד החדש נותן תמונה מלאה של מצב הטעינות ומאפשר עבודה מסודרת,
              מהירה וברורה יותר.
            </p>

            {/* תמונה */}
            <div style={{ marginTop: "16px", textAlign: "center" }}>
             <img
  src="/static/img/auto-dashboard.png"
  alt="דשבורד טעינות"
  style={{
    maxWidth: "100%",
    borderRadius: "12px",
    border: "1px solid #eee"
  }}
/>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "6px" }}>
                דשבורד טעינות חדש במערכת
              </div>
            </div>

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

export default AnnouncementV15;