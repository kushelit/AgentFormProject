'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import '../HelpPages.css';
import HelpNavigation from '@/components/HelpNavigation/HelpNavigation';

const CommissionImportHelp = () => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  if (!isClient) return null;

  return (
    <div className="help-container" dir="rtl">
      <h1>📖 מודול טעינת עמלות – מדריך שימוש</h1>
      <p className="lead">
        המודול מאפשר להשוות בין העמלה שדווחה בקובץ שהעלית לבין העמלה שמחושבת ב-<strong>MagicSale</strong> מתוך נתוני המכירות וההסכמים שהוגדרו במערכת.
        בדף זה נסביר כיצד לעבוד גם בדף ההשוואה הראשי וגם מתוך דף הלקוח.
      </p>

      <div className="toc">
        <div>תוכן עניינים</div>
        <ol>
          <li><a href="#compare-page">דף ההשוואה: קובץ מול MagicSale</a></li>
          <li><a href="#tolerance">ספי סטייה (סכום/אחוז)</a></li>
          <li><a href="#family">תא משפחתי והגבלות חיפוש</a></li>
          <li><a href="#status-cards">סיכום לפי סטטוס</a></li>
          <li><a href="#linking">קישור פוליסה מקובץ למכירה קיימת</a></li>
          <li><a href="#export">ייצוא לאקסל</a></li>
          <li><a href="#in-customer">עבודה מתוך דף לקוח</a></li>
          <li><a href="#faq">שאלות נפוצות</a></li>
        </ol>
      </div>

      {/* 1. compare page */}
      <section id="compare-page">
        <h2>1) דף ההשוואה: קובץ טעינה מול MagicSale</h2>
        <p>
          במסך <strong>השוואת טעינת עמלות (קובץ) מול MagicSale</strong>, בחרו:
          <strong> סוכן</strong>, <strong>חברה</strong>, <strong>חודש דיווח מהקובץ</strong>,
          ו-<strong>תא משפחתי</strong> <em>(אופציונלי)</em>.
          לאחר בחירה – הנתונים ייטענו ויוצגו בטבלה מפורטת.
        </p>

        <div className="step-grid">
          <figure>
            <Image src="/static/img/help/comm-import/compare-top.png" alt="סרגל סיכומים וקריטריוני סינון" width={1080} height={520} />
          </figure>
        </div>
      </section>

      {/* 2. tolerance */}
      <section id="tolerance">
        <h2>2) ספי סטייה (סכום / אחוז)</h2>
        <p>
          כדי “לדלל” פערים קטנים, הגדירו <strong>סף סטייה בסכום (₪)</strong> ו-<strong>סף סטייה באחוז שינוי (%)</strong>.
          שורה תסומן כ-<strong>ללא שינוי</strong> אם <u>לפחות אחד</u> מהתנאים מתקיים:
        </p>
        <ul>
          <li>הפרש מוחלט ≤ סף סכום</li>
          <li>שינוי יחסי ≤ סף אחוז</li>
        </ul>
        <div className="tip">
          💡 הספים נשמרים כברירת מחדל לסוכן וייטענו אוטומטית בפעם הבאה.
        </div>
      </section>

      {/* 3. family */}
      <section id="family">
        <h2>3) תא משפחתי וחיפוש</h2>
        <p>
          סימון <strong>תא משפחתי</strong> יכלול בהשוואה את כלל בני המשפחה (לפי <code>מבוטח אב</code>).
          כך ניתן לראות את כלל הפוליסות הקשורות למשפחה אחת באותו חישוב.
        </p>
      </section>

      {/* 4. status + drilldown */}
      <section id="status-cards">
        <h2>4) סיכום לפי סטטוס</h2>
        <p>
          מתחת למסננים מוצגת טבלת <strong>סיכום לפי סטטוס</strong>:
          <strong> לא דווח בקובץ</strong>, <strong>אין מכירה במערכת</strong>,
          <strong> שינוי</strong>, ו-<strong>ללא שינוי</strong>.
          לחיצה על המספר תפתח פירוט של אותו סטטוס בלבד.
        </p>

        <div className="step-grid">
          <figure>
            <Image src="/static/img/help/comm-import/status-summary.png" alt="סיכום לפי סטטוס" width={1080} height={420} />
          </figure>
        </div>
      </section>

      {/* 5. linking */}
      <section id="linking">
        <h2>5) קישור פוליסה מרשומת קובץ למכירה קיימת</h2>
        <p>
          בשורות עם סטטוס <strong>אין מכירה במערכת</strong> יופיע כפתור <em>“קישור לפוליסה”</em>.
          הפעולה מחפשת מכירות תקינות <u>ללא מספר פוליסה</u> שעומדות בכללים:
          חברה תואמת, סטטוס <strong>פעילה / הצעה</strong>, ולקוח זהה –
          כדי שתוכלו לשייך את מספר הפוליסה מהקובץ למכירה בפועל ובכך לייעל את תיחקור הפערים.
        </p>

        <div className="step-grid">
          <figure>
            <Image src="/static/img/help/comm-import/link-dialog.png" alt="דיאלוג קישור פוליסה" width={840} height={520} />
          </figure>
        </div>
      </section>

      {/* 6. export */}
      <section id="export">
        <h2>6) ייצוא לאקסל</h2>
        <p>
          לחצו על אייקון <strong>האקסל</strong> כדי לייצא את התוצאות המסוננות לקובץ.
          שורת סיכום תתווסף אוטומטית לסוף הגיליון.
        </p>
      </section>

      {/* 7. in customer page */}
      <section id="in-customer">
        <h2>7) שימוש בתוך דף לקוח</h2>
        <p>
          מתוך <strong>דף הלקוח</strong> ניתן לפתוח את אותו מנגנון השוואה. במצב זה:
        </p>
        <ul>
          <li>ההשוואה מתבצעת על הלקוח הנוכחי בלבד; סימון <strong>תא משפחתי</strong> ירחיב לשאר בני המשפחה.</li>
          <li>סיכומי <strong>MagicSale</strong> בצד שמאל (נפרעים) יתעדכנו לרמת הלקוח או התא המשפחתי שנבחר.</li>
        </ul>

        <div className="step-grid">
          <figure>
            <Image src="/static/img/help/comm-import/customer-embed.png" alt="השוואה מתוך דף הלקוח" width={1080} height={560} />
            <figcaption>הפעלת ההשוואה מתוך דף הלקוח</figcaption>
          </figure>
        </div>
      </section>

      {/* 8. FAQ (מקום עתידי אם תוסיפי) */}
      <HelpNavigation />
    </div>
  );
};

export default CommissionImportHelp;
