import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV9 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>

        <h2 className="announcement-title">✨ MagicSale - גרסה חדשה!</h2>
        <p>
          העדכון הנוכחי כולל שדרוגים במודול פיצול העמלות,
          בדוחות הנפרעים ובמבט הניהולי ברמת קבוצת הסוכנים.
        </p>

        <h3>🔧 1. מודול הפיצולים תומך כעת בשתי שיטות חישוב נפרדות</h3>
        
        <ul>
          <li>🔹 <strong>פיצול מתפוקה</strong></li>
          <li>🔹 <strong>פיצול מעמלה</strong></li>
        </ul>
        <p>
          השינוי משפיע על כלל המערכת וניתן לראותו ב־
          <strong> דף הלקוח</strong>, <strong>הדף המרכזי</strong>,{" "}
          <strong>דף השוואת הנפרעים</strong> (קובץ מול MagicSale){" "}
          וכן <strong>בדוחות השונים</strong>.
          <br />
          בכך מתקבל חישוב מדויק יותר, בהתאם לאופי הפיצול שהוגדר בפועל.
        </p>

        <h3>📄 2. דוח חדש: נפרעים מסוכם – מטעינת קבצים</h3>
        <p>
          הדוח החדש מאפשר לראות במבט אחד את כלל{" "}
          <strong>סכומי הנפרעים שהגיעו מקבצי העמלות שנטענו</strong>
        </p>

        <h3>🏢 3. למנהלים: מבט קבוצתי בדף מרכז</h3>
        <p>
          למשתמשים בעלי תפקיד <strong>מנהל קבוצת סוכנים</strong> התווסף כעת מבט{" "}
          ברמת <strong>קבוצת הסוכנים</strong>:
        </p>
        <ul>
          <li>🔹 בדף המרכז – תצוגה מסכמת ברמת קבוצה, ולא רק ברמת סוכן בודד</li>
        </ul>

        <p className="announcement-footnote">
          למידע נוסף והסברים מפורטים, בקרו בדף ההדרכה:
          <br />
          <a
            href="/Help/commission-import"
            onClick={onAcknowledge}
            className="help-link"
          >
            פתיחת דף ההדרכה למודול טעינת עמלות →
          </a>
        </p>

        <button className="acknowledge-button" onClick={onAcknowledge}>
          הבנתי
        </button>
      </div>
    </div>
  );
};

export default AnnouncementV9;
