import React from "react";
import Link from "next/link";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

// מסך סיכום העמלות החדש (אותו נתיב כמו בתפריט "דף מסכם עמלות")
const SUMMARY_PAGE = "/importCommissionHub/CommissionSummary";

const AnnouncementV23 = ({ onAcknowledge, onClose }: Props) => {
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
            מסך עמלות חדש לגמרי, סקירת AI לתיק, והשוואת טעינות משודרגת
          </p>
        </div>

        {/* ───────── מסך סיכום עמלות חדש ───────── */}
        <div className="release-hero">
          <div className="release-hero-top">
            <span className="release-hero-tag">חדש!</span>
            <h3>📊 מסך סיכום עמלות חדש</h3>
          </div>

          <p className="release-hero-text">
            מידע שעוזר לכם לנהל את העסק נכון יותר ויעיל יותר:{" "}
            <strong>סיכומי צבירה ופרמיה ברמת לקוח, פוליסה, סוכן וחברה</strong>
            {" "}— ופירוט מלא בלחיצה על כל מספר.
          </p>

          <div className="release-hero-chips">
            <span>📈 סקירה והכנסות</span>
            <span>✨ תובנות ו-AI</span>
            <span>🗓️ עמלות לפי חודש פרסום / דיווח</span>
            <span>🧾 מוצרים</span>
            <span>⚠️ פוליסות חריגות</span>
            <span>👥 ייבוא לקוחות מהטעינות</span>
          </div>

          <Link
            href={SUMMARY_PAGE}
            className="release-hero-link"
            onClick={onAcknowledge}
          >
            למסך החדש ←
          </Link>
        </div>

        {/* ───────── שאר החידושים ───────── */}
        <div className="release-features-grid">
          <div className="release-feature">
            <span className="release-feature-icon">✨</span>
            <div>
              <strong>סקירת AI לתיק</strong>
              <p>
                ניתוח חכם של התיק וההכנסות: איפה אתם עומדים, איך לנהל
                אותו נכון יותר ואיך למצות את הפוטנציאל — כולל נפרעים
                למשק בית והזדמנויות להרחבה.
              </p>
            </div>
          </div>

          <div className="release-feature">
            <span className="release-feature-icon">🔄</span>
            <div>
              <strong>השוואת טעינות בין חודשים – משודרגת</strong>
              <p>
                השוואה לפי חודש פרסום, פער בשקלים לכל פוליסה, מה הופיע רק באחד החודשים, ודוח התאמה מעוצב שמוכן לשליחה לחברת הביטוח.
              </p>
            </div>
          </div>

          <div className="release-feature">
            <span className="release-feature-icon">📁</span>
            <div>
              <strong>קישור ישיר לקבצים שירדו מהפורטלים</strong>
              <p>
                כל קובץ שירד מהפורטל זמין לפתיחה והורדה בלחיצה — בלי
                לחפש אותו.
              </p>
            </div>
          </div>

          <div className="release-feature">
            <span className="release-feature-icon">🔧</span>
            <div>
              <strong>התאמות לשינויים בדוחות בפורטלים</strong>
              <p>
                הקליטה עודכנה לשינויים שחברות הביטוח ביצעו בדוחות
                שלהן, כדי שהטעינה האוטומטית תמשיך לעבוד בצורה חלקה.
              </p>
            </div>
          </div>

          <div className="release-feature">
            <span className="release-feature-icon">⬆️</span>
            <div>
              <strong>עדכון גרסה והפעלת הבוט – משופרים</strong>
              <p>
                תהליך הורדת העדכון והפעלת הבוט במחשב עבר תיקונים
                ושדרוגים, והוא יציב וברור יותר.
              </p>
            </div>
          </div>

          <div className="release-feature release-feature-soon">
            <span className="release-feature-icon">💬</span>
            <div>
              <strong>
                <span className="release-soon-tag">בקרוב</span>
                הורדת דוחות דרך וואטסאפ
              </strong>
              <p>
                שלחו בקשה לבוט החדש שלנו בוואטסאפ, והדוחות יירדו
                בשבילכם.
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

export default AnnouncementV23;