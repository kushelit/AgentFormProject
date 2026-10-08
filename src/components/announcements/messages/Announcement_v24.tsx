import React from "react";
import Link from "next/link";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

// מסך סיכום העמלות (אותו נתיב כמו בתפריט "דף מסכם עמלות")
const SUMMARY_PAGE = "/importCommissionHub/CommissionSummary";

const AnnouncementV24 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box release-v21 release-v23">
        <button className="close-button" onClick={onClose} aria-label="סגירה">
          ✖
        </button>

        {/* ───────── כותרת ───────── */}
        <div className="release-header">
          <div className="announcement-badge">🚀 עדכון גרסה</div>

          <h2 className="announcement-title">
            מה חדש ב-<span dir="ltr">MagicSale</span>?
          </h2>

          <p className="release-subtitle">
            דוח נפרעים מהטעינות, פיצול עמלות מדויק יותר, ותשתית מתקדמת לקראת הבוט
          </p>
        </div>

        {/* ───────── דוח נפרעים מטעינות ───────── */}
        <div className="release-hero">
          <div className="release-hero-top">
            <span className="release-hero-tag">חדש!</span>
            <h3>📥 דוח נפרעים מהטעינות</h3>
          </div>

          <p className="release-hero-text">
            ישירות מדף סיכום העמלות:{" "}
            <strong>בוחרים חודש וחברות, ומקבלים דוח נפרעים מוכן באקסל</strong>
            {" "}— להורדה מיידית או לשליחה במייל.
          </p>

          <div className="release-hero-chips">
            <span>🗓️ לפי חודש פרסום / דיווח</span>
            <span>🏢 כל החברות או חברות נבחרות</span>
            <span>📊 קובץ אקסל מעוצב</span>
            <span>📧 שליחה במייל</span>
          </div>

          <Link
            href={SUMMARY_PAGE}
            className="release-hero-link"
            onClick={onAcknowledge}
          >
            לדף סיכום העמלות ←
          </Link>
        </div>

        {/* ───────── שאר החידושים ───────── */}
        <div className="release-features-grid">
          <div className="release-feature">
            <span className="release-feature-icon">🤝</span>
            <div>
              <strong>פיצול עמלות לפי קבוצת מוצר ומוצר</strong>
              <p>
                הסכם פיצול יכול לחול על קבוצת מוצר או על מוצר מסוים, ולא
                רק על כל המוצרים. החישוב מיושם בהשוואות ובדוחות, כך שכל
                שותף רואה בדיוק את החלק שלו.
              </p>
            </div>
          </div>

          <div className="release-feature">
            <span className="release-feature-icon">🛡️</span>
            <div>
              <strong>תשתית מתקדמת לקראת הבוט ועוזר ה-AI</strong>
              <p>
                שדרגנו את שכבת ההרשאות של המערכת, כדי שהבוט ועוזר ה-AI
                יוכלו לפעול בשמכם בצורה בטוחה — תמיד על המידע שלכם ושל
                הצוות שלכם בלבד.
              </p>
            </div>
          </div>

          <div className="release-feature">
            <span className="release-feature-icon">💬</span>
            <div>
              <strong>לקוחות MagicTouch – חיבור מספר WhatsApp עסקי קיים</strong>
              <p>
                אפשר לחבר את מספר ה-WhatsApp העסקי שאתם כבר עובדים איתו,
                ולא רק מספר חדש — וממשיכים להשתמש בו גם באפליקציה בטלפון.
                בנוסף, שודרגה התשתית של החיבור.
              </p>
            </div>
          </div>

          <div className="release-feature">
            <span className="release-feature-icon">📱</span>
            <div>
              <strong>קוד אימות בכניסה – שליחה חוזרת</strong>
              <p>
                לא הגיע קוד ב-SMS? אחרי 30 שניות אפשר לבקש קוד חדש
                ישירות מהמסך, בלי לחזור להתחלה.
              </p>
            </div>
          </div>

          <div className="release-feature release-feature-security">
            <span className="release-feature-icon">🙋</span>
            <div>
              <strong>נתקלתם במשהו שלא עובד כרגיל?</strong>
              <p>
                בעקבות שדרוג התשתית, אם מסך לא נפתח, חסר לכם מידע או
                מופיעה הודעה על הרשאה — כתבו לנו, ונטפל בהקדם.
              </p>
            </div>
          </div>
        </div>

        <button className="acknowledge-button" onClick={onAcknowledge}>
          הבנתי
        </button>
      </div>
    </div>
  );
};

export default AnnouncementV24;
