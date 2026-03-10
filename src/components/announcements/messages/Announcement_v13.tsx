import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV13 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>

        <h2 className="announcement-title">🚀 MagicSale - גרסה חדשה!</h2>

        <p>
          בגרסה זו עלתה <strong>תשתית חדשה לטעינה אוטומטית של עמלות נפרעים</strong>,
          כחלק מהרחבת יכולות המערכת וחיסכון בעבודה ידנית.
        </p>

        <h3>🤖 1. מודול חדש: טעינה אוטומטית של עמלות נפרעים</h3>
        <p>
          המערכת מתקדמת לשלב חדש עם <strong>מודול טעינה אוטומטית</strong> לדוחות עמלות נפרעים.
          המטרה היא לאפשר טעינה יעילה, מדויקת ונוחה יותר — ישירות דרך המערכת.
        </p>

        <h3>🏢 2. השקה ראשונה עם כלל ביטוח</h3>
        <p>
          בשלב הראשון, המודול עולה עם תמיכה בטעינה אוטומטית עבור{" "}
          <strong>חברת כלל ביטוח</strong>.
        </p>

        <h3>🔐 3. פתיחת הרשאות באופן מדורג</h3>
        <p>
          ההרשאות למודול החדש ייפתחו <strong>בהדרגה</strong> לסוכנים רלוונטיים,
          כדי לאפשר מעבר מסודר והטמעה נכונה של התהליך החדש.
        </p>

        <h3>🎓 4. ליווי והדרכה להתחלת עבודה</h3>
        <p>
          סוכנים שיקבלו גישה ילוו ב-<strong>הדרכה מסודרת</strong> לצורך התחלת עבודה עם
          המודול החדש, כולל הסבר על אופן השימוש והתהליך המומלץ.
        </p>

        <h3>✨ 5. תחילת מעבר לאוטומציה מתקדמת</h3>
        <p>
          זהו שלב ראשון בהקמת תשתית רחבה יותר ל-<strong>אוטומציה של טעינות</strong>,
          שתאפשר בעתיד להרחיב את התמיכה לחברות ותהליכים נוספים.
        </p>

        <button className="acknowledge-button" onClick={onAcknowledge}>
          הבנתי
        </button>
      </div>
    </div>
  );
};

export default AnnouncementV13;