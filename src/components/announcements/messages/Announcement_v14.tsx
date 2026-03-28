import React, { useState } from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV14 = ({ onAcknowledge, onClose }: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>
        <div className="announcement-badge">
          חדש: אוטומציה + ניתוח תיק + השוואה להסכם
        </div>
        <h2 className="announcement-title">
          🚀 MagicSale - גרסה חדשה!
        </h2>
        {/* 🔥 3 בולטים מרכזיים */}
        <div className="announcement-hero">

          <div className="hero-card">
            <div className="hero-icon">📊</div>
            <div className="hero-content">
              <div className="hero-title">
                ניתוח תיק שנתי עם ניתוח עומק ברמת מוצר
              </div>
              <div className="hero-sub">
                להבין בצורה ברורה איך באמת בנוי התיק שלכם
              </div>
            </div>
          </div>

          <div className="hero-card highlight">
            <div className="hero-icon">🧾</div>
            <div className="hero-content">
              <div className="hero-title">
                השוואה ישירה בין קבצי הנפרעים להסכמים
              </div>
              <div className="hero-sub">
                לבדוק אם העמלה שהתקבלה תואמת למה שציפיתם
              </div>
            </div>
          </div>
         <div className="hero-card automation">
  <div className="hero-icon">🤖</div>
  <div className="hero-content">
    <div className="hero-title">
      הרחבת ההורדה האוטומטית
    </div>
    <div className="hero-sub">
      המודול תומך כעת בכלל, מגדל, הפניקס ומנורה
    </div>
    <div className="hero-note">
      ⬆️ נדרש עדכון גרסה כדי להשתמש בתמיכה החדשה
    </div>
  </div>
</div>
        </div>
        {/* 👇 תקציר קצר */}
        {!isExpanded ? (
          <>
            <p>
              בגרסה זו הורחבו משמעותית יכולות המערכת עם אוטומציה מורחבת,
              כלי ניתוח מתקדמים והשוואה חכמה מול הסכמי עמלות.
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
            {/* 👇 פירוט מלא (כמו שהיה לך — רק מסודר) */}

            <h3>🤖 הרחבת ההורדה האוטומטית של קבצי נפרעים</h3>
            <p>
              מודול <strong>הטעינה האוטומטית של קבצי הנפרעים</strong> הורחב,
              וכעת תומך לא רק בכלל, אלא גם בחברות:
              <strong> מגדל</strong>, <strong>הפניקס</strong> ו-
              <strong> מנורה</strong>.
            </p>
            <p>
              לצורך שימוש בתוספות החדשות, נדרש{" "}
              <strong>לעדכן גרסה דרך כפתור העדכון</strong>.
            </p>

            <h3>📩 מייל סיכום אוטומטי בסיום טעינה</h3>
            <p>
              בסיום כל טעינה, נשלח <strong>מייל אוטומטי</strong> עם{" "}
              <strong>ניתוח תוצאות הטעינה</strong>, לצורך בקרה והבנה טובה יותר
              של תהליך הקליטה.
            </p>

            <h3>📊 ניתוח תיק שנתי עם ניתוח עומק ברמת מוצר</h3>
            <p>
              נוסף כפתור חדש בדף <strong>מסכם עמלות</strong>, המאפשר לבצע{" "}
              <strong>ניתוח עומק ברמת מוצר</strong>.
            </p>
            <p>
              המסך מאפשר להבין בצורה רחבה ומדויקת יותר את מבנה התיק,
              התפלגות המוצרים והתמונה השנתית הכוללת.
            </p>

            <h3>🧾 השוואה בין עמלה בפועל להסכם</h3>
            <p>
              נוסף מסך חדש המאפשר <strong>השוואה ישירה בין קבצי הנפרעים</strong>{" "}
              לבין <strong>הסכמי העמלות שהוזנו במערכת</strong>.
            </p>
            <p>
              כך ניתן לבדוק האם העמלה שהתקבלה תואמת למה שציפיתם לקבל,
              ולזהות פערים בצורה פשוטה וברורה.
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

export default AnnouncementV14;