'use client';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto p-8 text-right leading-loose text-gray-800">
      <h1 className="text-3xl font-bold mb-6 text-blue-800">מדיניות פרטיות</h1>
      <p className="mb-4">
        אנו ב־<strong>MagicSale</strong> מחויבים לשמור על פרטיות המשתמשים שלנו. מטרת מדיניות זו היא להסביר כיצד אנו אוספים, שומרים, משתמשים ומשתפים את המידע שאתם מוסרים לנו.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">איזה מידע אנחנו אוספים?</h2>
      <ul className="list-disc pr-6 mb-4">
        <li>מידע שאתם מוסרים לנו בטפסים כמו שם, טלפון, מייל והודעה</li>
        <li>מידע על השימוש שלכם במערכת (כגון תאריך התחברות, סוג מנוי וכדומה)</li>
        <li>מידע טכני לצרכי אבטחה, שיפור חוויית המשתמש וביצוע ניתוחים</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">כיצד אנו משתמשים במידע?</h2>
      <p className="mb-4">
        המידע משמש אך ורק לצורך:
        <ul className="list-disc pr-6">
          <li>הפעלה תקינה של השירותים</li>
          <li>תמיכה ושירות לקוחות</li>
          <li>שליחת עדכונים חשובים והודעות על שדרוגים</li>
        </ul>
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">שירותים חיצוניים</h2>
      <p className="mb-4">
        המערכת עושה שימוש בשירותים חיצוניים לצורך תפעול תקין:
        <ul className="list-disc pr-6">
          <li><strong>Firebase</strong> – לאחסון נתונים, אימות משתמשים וניהול הרשאות</li>
          <li><strong>Grow</strong> – לצורך חיוב ותשלומים מקוונים מאובטחים</li>
        </ul>
        נתונים אישיים שהוזנו במערכת עשויים להישלח לגורמים אלו לצורך מתן השירות בלבד, בהתאם למדיניות הפרטיות שלהם.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">שיתוף מידע</h2>
      <p className="mb-4">
        איננו משתפים את המידע האישי שלכם עם צדדים שלישיים ללא הסכמתכם, למעט כאשר נדרש על פי חוק, או כאשר השירות מחייב שיתוף עם ספק תשלום כמו Grow.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">אבטחת מידע</h2>
      <p className="mb-4">
        אנו נוקטים באמצעים טכנולוגיים וארגוניים סבירים כדי לשמור על המידע שלכם מוגן.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">השימוש למבוגרים בלבד</h2>
      <p className="mb-4">
        השימוש במערכת מיועד למשתמשים בגיל 18 ומעלה בלבד. המערכת פונה לסוכני ביטוח בלבד, אשר נדרשים לעמוד בתנאי החוק הישראלי לקבלת רישיון סוכן ביטוח, לרבות גיל מינימלי.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">יצירת קשר</h2>
      <p>
        אם יש לכם שאלות או בקשות לגבי מדיניות הפרטיות, אנא צרו קשר בכתובת <strong>admin@magicsale.co.il</strong> או דרך טופס <a href="/landing#contact" className="text-blue-600 underline">צור קשר</a>.
      </p>
    </div>
  );
}
