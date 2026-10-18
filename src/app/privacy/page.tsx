'use client';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto p-8 text-right leading-loose text-gray-800">
      <h1 className="text-3xl font-bold mb-6 text-blue-800">מדיניות פרטיות</h1>
      <p className="mb-2 text-sm text-gray-500">עודכן לאחרונה: 15.10.2026</p>

      <p className="mb-4">
        אנו ב־<strong>MagicSale</strong> מחויבים לשמור על פרטיות המשתמשים שלנו. מטרת מדיניות זו היא להסביר כיצד אנו אוספים, שומרים, משתמשים ומשתפים את המידע שאתם מוסרים לנו.
      </p>

      {/* זהות המפעיל/האחראי לעיבוד מידע */}
      <p className="mb-4">
        <strong>מי אנחנו והאחראי לעיבוד מידע:</strong> MagicSale מופעלת ומפותחת ע&quot;י
        {' '}<strong>יונמיקס פתרונות טכנולוגים בע&quot;מ</strong> (ח.פ. <strong>517213120</strong>),
        כתובת: עזרא גבאי 3, פתח תקווה, ישראל. טלפון:{" "}
        <a className="text-blue-600 underline" href="tel:0553001487" dir="ltr">055-300-1487</a>.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">1. איזה מידע אנחנו אוספים?</h2>
      <ul className="list-disc pr-6 mb-4">
        <li>מידע שאתם מוסרים לנו בטפסים כמו שם, טלפון, מייל והודעה</li>
        <li>פרטי המשתמש והמנוי: שם, טלפון, דוא&quot;ל, תעודת זהות או ח.פ</li>
        <li>מידע על לקוחות הסוכן, שהסוכן מעלה למערכת או שנטען בשמו ולבקשתו מפורטלי חברות הביטוח ובתי ההשקעות (דוחות עמלות, נפרעים וצבירות), הכולל שמות, מספרי זהות, מספרי פוליסה וחשבון, מוצרים, פרמיות, צבירות ועמלות. ראו סעיף 12</li>
        <li>פרטי התחברות לפורטלי חברות הביטוח, הנשמרים בהצפנה</li>
        <li>מידע על השימוש שלכם במערכת (כגון תאריך התחברות, סוג מנוי וכדומה)</li>
        <li>מידע טכני לצרכי אבטחה, שיפור חוויית המשתמש וביצוע ניתוחים</li>
        <li>מידע שנאסף באמצעות Cookies או טכנולוגיות דומות</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">2. כיצד אנו משתמשים במידע?</h2>
      <ul className="list-disc pr-6 mb-4">
        <li>הפעלה תקינה של השירותים</li>
        <li>תמיכה ושירות לקוחות</li>
        <li>שיפור חוויית המשתמש והתאמת המערכת לצרכים האישיים</li>
        <li>שליחת עדכונים חשובים והודעות על שדרוגים או שינויים בשירות</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">3. שירותים חיצוניים</h2>
      <p className="mb-4">
        אנו משתמשים בשירותים החיצוניים הבאים, וכל אחד מהם מקבל רק את המידע הנדרש לתפקידו:
      </p>
      <ul className="list-disc pr-6 mb-4">
        <li>Google (Firebase / Google Cloud) &ndash; אימות משתמשים, אחסון ועיבוד נתונים</li>
        <li>Vercel &ndash; הפעלת האתר והשרת</li>
        <li>Anthropic &ndash; הפקת סקירות ותובנות בעזרת בינה מלאכותית (ראו סעיף 13)</li>
        <li>Grow &ndash; תשלומים מאובטחים</li>
      </ul>
      <p className="mb-4">
        המידע מועבר אליהם אך ורק לצורך מתן השירות. המידע נשמר ומעובד בשרתי ספקים אלה, הממוקמים בארצות הברית, במסגרת הסכמים המחייבים אותם לשמור על המידע ולאבטח אותו.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">4. שיתוף מידע</h2>
      <p className="mb-4">
        איננו משתפים את המידע שלכם עם צדדים שלישיים אלא אם הדבר נדרש לצורך הפעלת השירות או עפ&quot;י חובה חוקית.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">5. Cookies וטכנולוגיות מעקב</h2>
      <p className="mb-4">
        אנו משתמשים בעוגיות (Cookies) לשם תפעול, התאמה אישית, ניתוח ביצועים ושיווק. המשתמש יכול לשנות את הגדרות השימוש בעוגיות דרך דפדפן האינטרנט שלו.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">6. אבטחת מידע</h2>
      <p className="mb-4">
        המידע נשמר בתשתית Google Cloud, בהפרדה מלאה בין סוכנים, בהתאם לתקנות הגנת הפרטיות. כל סוכן ועובדיו רואים רק את הנתונים של אותו סוכן, או של קבוצת סוכנים שהוגדרה להם במפורש.
        אנו מיישמים אמצעים טכנולוגיים וארגוניים מתקדמים כדי להגן על המידע האישי ולצמצם סיכוני גישה לא מורשית. יחד עם זאת, אין באפשרותנו להבטיח הגנה מוחלטת.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">7. שמירת מידע</h2>
      <p className="mb-4">
        המידע נשמר במסדי נתונים מאובטחים עם גישה מוגבלת. אין גישה שוטפת למידע מצד צוות
        {' '}<strong>יונמיקס (MagicSale)</strong>, אלא רק לצורך מתן שירות טכני, תמיכה או עמידה בחובה חוקית/רגולטורית.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">8. מימוש זכויות המשתמש</h2>
      <p className="mb-4">
        בהתאם לחוק, המשתמש רשאי לבקש לעיין, לעדכן או למחוק את המידע האישי שנשמר עליו. ניתן לפנות אלינו בדוא&quot;ל:
        {' '}<a className="text-blue-600 underline" href="mailto:admin@magicsale.co.il">admin@magicsale.co.il</a>.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">9. שינויים במדיניות הפרטיות</h2>
      <p className="mb-4">
        אנו שומרים לעצמנו את הזכות לשנות את המדיניות לפי הצורך. במקרה של שינוי מהותי תישלח הודעה מתאימה ויפורסם תאריך העדכון האחרון.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">10. יצירת קשר</h2>
      <p className="mb-1">
        לשאלות, בירורים או בקשות, ניתן לפנות:{" "}
        <a className="text-blue-600 underline" href="mailto:admin@magicsale.co.il">admin@magicsale.co.il</a>{" "}
        או בטלפון <a className="text-blue-600 underline" href="tel:0553001487" dir="ltr">055-300-1487</a>.
      </p>
      <p className="text-sm text-gray-500">
        כתובת למשלוח דואר: עזרא גבאי 3, פתח תקווה, ישראל. לפרטים נוספים ראו גם את{" "}
        <a href="/terms" className="text-blue-600 underline">תנאי השימוש</a>.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">11. תוסף Chrome &quot;MagicSale Portal Runner&quot;</h2>
      <p className="mb-2">
        התוסף מיועד לסוכני ביטוח המנויים ל־MagicSale, ומשמש להורדת דוחות עמלות מפורטלי חברות הביטוח ובתי ההשקעות בשם הסוכן ולבקשתו.
      </p>
      <ul className="list-disc pr-6 mb-4">
        <li><strong>סיסמאות לפורטלים:</strong> נשלפות באופן מוצפן מחשבון ה־MagicSale של הסוכן לצורך הריצה בלבד, ואינן נשמרות בתוסף.</li>
        <li><strong>קודי אימות (OTP):</strong> מוזנים ע&quot;י הסוכן באתר MagicSale, משמשים פעם אחת ואינם נשמרים בתוסף.</li>
        <li><strong>דוחות:</strong> הדוחות שהורדו מועלים לחשבון ה־MagicSale של הסוכן (Firebase/Google Cloud). עד להשלמת ההעלאה הם נשמרים זמנית בדפדפן ונמחקים לאחריה.</li>
        <li><strong>היקף ההרשאות:</strong> התוסף פועל רק באתרי הפורטלים המפורטים בהרשאותיו, ורק בחלון העבודה שהוא פותח. הוא משתמש בהתחברויות הקיימות של הסוכן ב־Chrome לאתרים אלה.</li>
        <li><strong>מה התוסף אינו עושה:</strong> אינו קורא היסטוריית גלישה, אינו ניגש לאתרים אחרים ואינו קורא סיסמאות השמורות ב־Chrome.</li>
        <li><strong>שימוש מוגבל:</strong> המידע משמש אך ורק להפעלת שירות הטעינה האוטומטית. הוא אינו נמכר, אינו משמש לפרסום ואינו מועבר לצדדים שלישיים, למעט ספקי התשתית הנדרשים להפעלת השירות.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">12. מידע על לקוחות הסוכן</h2>
      <p className="mb-4">
        הסוכן הוא בעל המאגר של המידע על לקוחותיו. MagicSale מעבדת מידע זה מטעם הסוכן, לפי הוראותיו ולצורך מתן השירות לו בלבד,
        ואינה משתמשת בו לכל מטרה אחרת, אינה מוכרת אותו ואינה מעבירה אותו לצדדים שלישיים, למעט ספקי השירות המפורטים בסעיף 3.
        הסוכן אחראי לכך שהוא מוסמך להעלות את המידע ולכך שלקוחותיו יודעו כנדרש בדין.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">13. שימוש בבינה מלאכותית</h2>
      <p className="mb-4">
        חלק מהשירותים, כגון סקירת התיק, מופקים בעזרת מודלים של בינה מלאכותית. לצורך הסקירה נשלחים לספק ה־AI נתונים מסוכמים בלבד
        (כגון סכומים לפי חברה, מוצר וחודש), ללא פרטים מזהים של לקוחות. המידע אינו משמש לאימון מודלים.
        תוצרי ה־AI נועדו לעזר בלבד ועלולים לכלול אי־דיוקים.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">14. שמירה ומחיקה לאחר סיום מנוי</h2>
      <p className="mb-4">
        עם סיום המנוי תיחסם הגישה למערכת. המידע יישמר עד 90 יום לצורך ייצוא לבקשת המשתמש, ולאחר מכן יימחק.
        ניתן לבקש מחיקה מוקדמת בפנייה ל־<a className="text-blue-600 underline" href="mailto:admin@magicsale.co.il">admin@magicsale.co.il</a>.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">15. אירוע אבטחת מידע</h2>
      <p className="mb-4">
        אם יתרחש אירוע אבטחת מידע הנוגע למידע של המשתמש, נודיע לו על כך ללא דיחוי.
      </p>

      <div dir="ltr" className="text-left mb-4">
        <h3 className="text-lg font-semibold mt-4 mb-2 text-indigo-700">Chrome Extension &quot;MagicSale Portal Runner&quot;</h3>
        <p className="mb-2">
          The extension is intended for insurance agents subscribed to MagicSale. It downloads commission reports from insurance and investment-house portals on the agent&apos;s behalf and at the agent&apos;s request.
        </p>
        <ul className="list-disc pl-6">
          <li><strong>Portal credentials:</strong> retrieved encrypted from the agent&apos;s MagicSale account only for the duration of a run; they are not stored by the extension.</li>
          <li><strong>One-time codes (OTP):</strong> entered by the agent on the MagicSale website, used once and not stored by the extension.</li>
          <li><strong>Reports:</strong> downloaded reports are uploaded to the agent&apos;s MagicSale account (Firebase/Google Cloud). Until the upload completes they are held temporarily in the browser and are then deleted.</li>
          <li><strong>Permissions:</strong> the extension operates only on the portal sites listed in its permissions and only in the worker window it opens. It uses the agent&apos;s existing Chrome sign-ins to those sites.</li>
          <li><strong>What it does not do:</strong> it does not read browsing history, access other sites, or read passwords saved in Chrome.</li>
          <li><strong>Limited Use:</strong> data is used solely to provide the automated report-loading service. It is not sold, not used for advertising, and not transferred to third parties except the infrastructure providers required to operate the service.</li>
        </ul>
      </div>
    </div>
  );
}
