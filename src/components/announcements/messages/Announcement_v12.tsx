import React from "react";
import "../announcementPopup.css";

interface Props {
  onAcknowledge: () => void;
  onClose: () => void;
}

const AnnouncementV12 = ({ onAcknowledge, onClose }: Props) => {
  return (
    <div className="announcement-overlay" dir="rtl">
      <div className="announcement-box">
        <button className="close-button" onClick={onClose}>✖</button>

        <h2 className="announcement-title">✨ MagicSale - גרסה חדשה!</h2>
        <p>
          העדכון כולל שדרוגים בדפי <strong>עסקאות</strong> ו-<strong>מסכם עמלות</strong>,
          שיפורי נוחות, ותיקוני טעינה חשובים.
        </p>

        <h3>🧩 1. ניהול עסקאות: עדכון מקור ליד (ברמת לקוח)</h3>
        <p>
          נוספה אפשרות לעדכן <strong>מקור ליד</strong> ישירות מתוך <strong>מסך העסקה</strong>.
          מקור הליד נשמר ומתעדכן <strong>ברמת הלקוח</strong> כדי לשמור אחידות בין העסקאות.
        </p>

        <h3>🪪 2. דף מסכם עמלות: ת״ז בפירוט (Drill-down)</h3>
        <p>
  בפירוט הפוליסות (Drill-down) שנפתח מתוך מסכם עמלות — נוסף שדה <strong>תעודת זהות{" "}</strong>
  כדי להקל על איתור לקוח ובקרה.
</p>

        <h3>🔊 3. שליטה בצליל בסיום הזנת עסקה</h3>
        <p>
          הוספנו אפשרות <strong>לבטל/להפעיל</strong> את הצליל שמושמע בסיום הזנת עסקה.
          במסך העסקאות נוסף <strong>אייקון הגדרות</strong> לניהול ההעדפה.
        </p>

        <h3>🛠️ 4. תיקוני טעינה – מגדל</h3>
<ul>
  <li>
    ✅ <strong>תיקון טעינת קבצים</strong> – מגדל
  </li>
  <li>
    ✅ תבניות: <strong>ביטוח חיים</strong> ו-<strong>גמל</strong>{" "}
    <span className="announcement-note">
      (סוכנים שטענו תבניות אלו מתבקשים לטעון מחדש את הקבצים עבור{" "}
      <strong>2025</strong>)
    </span>
  </li>
</ul>
        <h3>✅ 5. מסכם עמלות: בדיקת שלמות נתונים</h3>
        <p>
  נוסף קישור ל-<strong>בדיקת שלמות נתונים</strong>:
  לחיצה עליו מציגה בצורה ברורה <strong>אילו דוחות נטענו</strong> ואילו{" "}
  <strong>לא נטענו</strong>{" "}
  לכל חברה/חודש.
</p>
        <button className="acknowledge-button" onClick={onAcknowledge}>
          הבנתי
        </button>
      </div>
    </div>
  );
};

export default AnnouncementV12;
