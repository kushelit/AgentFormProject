import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV22 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box compact">
        <button
          className="close-button"
          onClick={onClose}
          aria-label="סגירה"
        >
          ✖
        </button>

        <div className="announcement-badge">
          חדש: עדכון במערכת
        </div>

        <h2 className="announcement-title">
          ✨ מה חדש?
        </h2>

        <div className="announcement-summary-list">
          <div className="summary-item">
            <span className="summary-icon">🔎</span>

            <span>
              <strong>חדש בדף מרכז – Drill Down לסיכומים החודשיים</strong>
              <br />
              מעכשיו ניתן ללחוץ על סכום חודשי בטבלה ולקבל את{" "}
              <strong>הפירוט המלא שמרכיב אותו</strong> – לקוח, חברה,
              מוצר וסכום.
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-icon">🛠️</span>

            <span>
              <strong>תיקונים ושיפורים במערכת</strong>
              <br />
              בוצעו מספר תיקונים ושיפורים נוספים לשיפור היציבות
              וחוויית העבודה.
            </span>
          </div>
        </div>

        {/* MagicTouch */}
        <div className="magictouch-showcase magictouch-showcase-compact">
          <div className="magictouch-main-title">
            <div className="magictouch-new-label">
              ✨ וגם תזכורת למערכת החדשה שלנו
            </div>

            <h3>
              <span dir="ltr">MagicTouch</span>
            </h3>

            <strong className="magictouch-tagline">
              תקשורת ותהליכים אוטומטיים מול הלקוחות
            </strong>
          </div>

          <p className="magictouch-compact-description">
            MagicTouch מאפשרת לנהל תהליכים אוטומטיים מול הלקוחות –
            WhatsApp, בוטים ומענה אוטומטי, בקשת מסמכים, תזכורות
            וחיבורים למערכות נוספות.
          </p>

          <div className="magictouch-compact-features">
            <span>💬 WhatsApp</span>
            <span>🤖 בוטים</span>
            <span>📄 מסמכים</span>
            <span>🔗 Surense / Roeto</span>
          </div>

          <div className="magictouch-contact magictouch-contact-compact">
            <span className="magictouch-contact-icon">
              📞
            </span>

            <div>
              <strong>
                רוצים לראות איך{" "}
                <span dir="ltr">MagicTouch</span>{" "}
                יכולה להשתלב אצלכם?
              </strong>

              <span>
                ניתן לפנות אלינו לקבלת פרטים והדגמה.
              </span>
            </div>
          </div>
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

export default AnnouncementV22;