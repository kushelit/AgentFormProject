import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV21 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box release-v21">
        <button
          className="close-button"
          onClick={onClose}
          aria-label="סגירה"
        >
          ✖
        </button>

        {/* HEADER */}
        <div className="release-header">
          <div className="announcement-badge">
            חדש: עדכונים ושיפורים במערכת
          </div>

          <h2 className="announcement-title">
            ✨ מה חדש בגרסה החדשה?
          </h2>

          <p className="release-subtitle">
            ממשיכים לשפר את העבודה היומיומית שלכם — יותר חופש,
            יותר נוחות ויותר אבטחה.
          </p>
        </div>

        {/* SYSTEM UPDATES */}
        <div className="release-features-grid">
          <div className="release-feature">
            <span className="release-feature-icon">📊</span>

            <div>
              <strong>
                שיפורים במודול טעינת העמלות האוטומטית
              </strong>

              <p>
                המשכנו לשפר ולייעל את תהליך טעינת העמלות
                והעבודה עם דוחות העמלות במערכת.
              </p>
            </div>
          </div>

          <div className="release-feature">
            <span className="release-feature-icon">🔄</span>

            <div>
              <strong>
                ממשיכים לעבוד גם בזמן הריצה
              </strong>

              <p>
                אין צורך להישאר במסך טעינת העמלות.
                תוכלו לעבור בין מסכי המערכת ולהמשיך לעבוד
                בזמן שהתהליך רץ.
              </p>
            </div>
          </div>

          <div className="release-feature">
            <span className="release-feature-icon">📱</span>

            <div>
              <strong>
                קוד SMS יגיע אליכם בכל מקום במערכת
              </strong>

              <p>
                כאשר חברת הביטוח דורשת קוד אימות,
                חלון הזנת הקוד יופיע אוטומטית במסך שבו
                אתם נמצאים, כל עוד המערכת פתוחה.
              </p>
            </div>
          </div>

          <div className="release-feature">
            <span className="release-feature-icon">📍</span>

            <div>
              <strong>
                מתעדכנים בסטטוס הריצה בכל שלב
              </strong>

              <p>
                תוכלו לחזור בכל רגע למסך טעינת העמלות
                ולראות את מצב הריצה וההתקדמות שלה.
              </p>
            </div>
          </div>

          <div className="release-feature release-feature-security">
            <span className="release-feature-icon">🔐</span>

            <div>
              <strong>
                אבטחה משופרת
              </strong>

              <p>
                הוספנו ניתוק אוטומטי מהמערכת לאחר
                זיהוי של חוסר פעילות, לשמירה טובה יותר
                על המידע שלכם.
              </p>
            </div>
          </div>
        </div>

        {/* MAGICTOUCH */}
        <div className="magictouch-showcase">
          <div className="magictouch-showcase-header">
            <div className="magictouch-main-title">
              <div className="magictouch-new-label">
                ✨ וגם חדש
              </div>

              <h3>
                <span dir="ltr">MagicTouch</span>
              </h3>

              <strong className="magictouch-tagline">
                מערכת לתקשורת ותהליכים אוטומטיים מול הלקוחות
              </strong>
            </div>

            <p className="magictouch-description">
              הופכים תהליכים שמתבצעים היום באופן ידני
              לתהליכים חכמים ואוטומטיים מול הלקוחות שלכם —
              משלב הפנייה ועד להשלמת התהליך.
            </p>
          </div>

          <div className="magictouch-mini-grid">
            <div className="magictouch-mini-card">
              <span className="magictouch-mini-icon whatsapp-icon">
                💬
              </span>

              <strong>
                WhatsApp אוטומטי
              </strong>

              <small>
                הודעות, תזכורות ופניות יזומות ללקוחות
              </small>
            </div>

            <div className="magictouch-mini-card">
              <span className="magictouch-mini-icon">
                🤖
              </span>

              <strong>
                בוטים ומענה אוטומטי
              </strong>

              <small>
                ניהול שיחות והמשך תהליך לפי תשובות הלקוח
              </small>
            </div>

            <div className="magictouch-mini-card">
              <span className="magictouch-mini-icon">
                📄
              </span>

              <strong>
                בקשת מסמכים
              </strong>

              <small>
                שליחה ומעקב אחר המסמכים הנדרשים מהלקוח
              </small>
            </div>

            <div className="magictouch-mini-card">
              <span className="magictouch-mini-icon">
                🔗
              </span>

              <strong>
                חיבורים למערכות
              </strong>

              <small>
                Surense, Roeto ומערכות נוספות כחלק מהתהליך
              </small>
            </div>
          </div>

          <div className="magictouch-contact">
            <span className="magictouch-contact-icon">
              📞
            </span>

            <div>
              <strong>
                רוצים לראות איך{" "}
                <span dir="ltr">MagicTouch</span>{" "}
                יכולה להשתלב בתהליכי העבודה שלכם?
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

export default AnnouncementV21;