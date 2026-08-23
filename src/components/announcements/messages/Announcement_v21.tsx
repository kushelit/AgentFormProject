import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV21 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box expanded">
        <button
          className="close-button"
          onClick={onClose}
          aria-label="סגירה"
        >
          ✖
        </button>

        <div className="announcement-badge">
          חדש: עדכונים ושיפורים במערכת
        </div>

        <h2 className="announcement-title">
          ✨ מה חדש בגרסה החדשה?
        </h2>

        <div className="announcement-hero">
          <div className="hero-card highlight">
            <div className="hero-icon">🚀</div>

            <div>
              <div className="hero-title">
                ממשיכים לשפר את העבודה היומיומית שלכם
              </div>

              <div className="hero-sub">
                יותר חופש בזמן טעינת עמלות, יותר נוחות ויותר אבטחה.
              </div>
            </div>
          </div>
        </div>

        <div className="announcement-summary-list">
          <div className="summary-item">
            <span className="summary-icon">📊</span>

            <span>
              <strong>שיפורים במודול טעינת העמלות האוטומטית</strong>
              <br />
              המשכנו לשפר ולייעל את תהליך טעינת העמלות והעבודה עם דוחות
              העמלות במערכת.
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-icon">🔄</span>

            <span>
              <strong>ממשיכים לעבוד גם בזמן הריצה</strong>
              <br />
              אין צורך יותר להישאר במסך טעינת העמלות בזמן שהתהליך רץ.
              תוכלו לעבור בין מסכי המערכת ולהמשיך לעבוד כרגיל.
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-icon">📱</span>

            <span>
              <strong>קוד SMS יגיע אליכם בכל מקום במערכת</strong>
              <br />
              כאשר אחת מחברות הביטוח דורשת קוד אימות, חלון הזנת הקוד
              יופיע אוטומטית במסך שבו אתם נמצאים, כל עוד המערכת פתוחה.
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-icon">📍</span>

            <span>
              <strong>מתעדכנים בסטטוס הריצה בכל שלב</strong>
              <br />
              תוכלו לחזור בכל רגע למסך טעינת העמלות ולראות את מצב הריצה
              וההתקדמות שלה.
            </span>
          </div>

          <div className="summary-item">
            <span className="summary-icon">🔐</span>

            <span>
              <strong>ניתוק אוטומטי לאחר חוסר פעילות</strong>
              <br />
              הוספנו מנגנון ניתוק אוטומטי לאחר זיהוי של חוסר פעילות,
              לשמירה טובה יותר על המידע שלכם.
            </span>
          </div>
        </div>

        {/* MagicTouch */}
        <div className="magictouch-announcement">
          <div className="magictouch-top">
            <div className="magictouch-heading">
              <span className="magictouch-sparkle">✨</span>

              <div>
                <div className="magictouch-title">
                  וגם חדש: <strong>MagicTouch</strong>
                </div>

                <div className="magictouch-subtitle">
                  מערכת לתקשורת ותהליכים אוטומטיים מול הלקוחות
                </div>
              </div>
            </div>

            <p className="magictouch-intro">
              MagicTouch מאפשרת להפוך תהליכים שמתבצעים היום באופן ידני
              לתהליכים חכמים ואוטומטיים מול הלקוחות שלכם.
            </p>
          </div>

          <div className="magictouch-features">
            <div className="magictouch-feature">
              <div className="magictouch-feature-icon whatsapp">
                💬
              </div>

              <div className="magictouch-feature-content">
                <strong>WhatsApp אוטומטי</strong>

                <span>
                  שליחת הודעות, תזכורות ופניות יזומות ללקוחות.
                </span>
              </div>
            </div>

            <div className="magictouch-feature">
              <div className="magictouch-feature-icon">
                🤖
              </div>

              <div className="magictouch-feature-content">
                <strong>בוטים ומענה אוטומטי</strong>

                <span>
                  ניהול שיחות והמשך התהליך בהתאם לתשובות הלקוח.
                </span>
              </div>
            </div>

            <div className="magictouch-feature">
              <div className="magictouch-feature-icon">
                📄
              </div>

              <div className="magictouch-feature-content">
                <strong>בקשת מסמכים</strong>

                <span>
                  שליחה ומעקב אחר המסמכים הנדרשים מהלקוח במהלך התהליך.
                </span>
              </div>
            </div>

            <div className="magictouch-feature">
              <div className="magictouch-feature-icon">
                🔗
              </div>

              <div className="magictouch-feature-content">
                <strong>חיבורים למערכות נוספות</strong>

                <span>
                  שילוב עם Surense, Roeto ומערכות נוספות כחלק מתהליך
                  העבודה.
                </span>
              </div>
            </div>
          </div>

          <div className="magictouch-cta">
            <span className="magictouch-cta-icon">
              📞
            </span>

            <div>
              <strong>
                רוצים לראות איך MagicTouch יכולה להשתלב בתהליכי העבודה
                שלכם?
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