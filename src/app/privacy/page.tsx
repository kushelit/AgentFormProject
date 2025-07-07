'use client';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto p-8 text-right leading-loose text-gray-800">
      <h1 className="text-3xl font-bold mb-6 text-blue-800">מדיניות פרטיות</h1>
      <p className="mb-4">
        אנו ב־<strong>MagicSale</strong> מחויבים לשמור על פרטיות המשתמשים שלנו. מטרת מדיניות זו היא להסביר כיצד אנו אוספים, שומרים, משתמשים ומשתפים את המידע שאתם מוסרים לנו.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">1. איזה מידע אנחנו אוספים?</h2>
      <ul className="list-disc pr-6 mb-4">
        <li>מידע שאתם מוסרים לנו בטפסים כמו שם, טלפון, מייל והודעה</li>
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
        אנו משתמשים בשירותים חיצוניים כגון Firebase (לאימות, אחסון והרשאות) ו&ndash;Grow (לתשלומים מאובטחים). המידע האישי מועבר אליהם אך ורק לצורך מתן השירות, בהתאם למדיניות הפרטיות שלהם.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">4. שיתוף מידע</h2>
      <p className="mb-4">
        איננו משתפים את המידע שלכם עם צדדים שלישיים אלא אם הדבר נדרש לצורך הפעלת השירות או עפ"י חובה חוקית.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">5. Cookies וטכנולוגיות מעקב</h2>
      <p className="mb-4">
        אנו משתמשים בעוגיות (Cookies) לשם תפעול, התאמה אישית, ניתוח ביצועים ושיווק. המשתמש יכול לשנות את הגדרות השימוש בעוגיות דרך דפדפן האינטרנט שלו.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">6. אבטחת מידע</h2>
      <p className="mb-4">
        אנו מיישמים אמצעים טכנולוגיים וארגוניים מתקדמים, בהתאם לתקנות הגנת הפרטיות בישראל, כדי להגן על המידע האישי ולצמצם סיכוני גישה לא מורשית. יחד עם זאת, אין באפשרותנו להבטיח הגנה מוחלטת.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">7. שמירת מידע</h2>
      <p className="mb-4">
        המידע נשמר במסדי נתונים מאובטחים עם גישה מוגבלת. אין גישה שוטפת למידע מצד צוות MagicSale, אלא רק לצורך מתן שירות טכני או חוקי.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">8. מימוש זכויות המשתמש</h2>
      <p className="mb-4">
        בהתאם לחוק, המשתמש רשאי לבקש לעיין, לעדכן או למחוק את המידע האישי שנשמר עליו. ניתן לפנות אלינו בדוא&quot;ל: <a className="text-blue-600 underline" href="mailto:admin@magicsale.co.il">admin@magicsale.co.il</a>.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">9. שינויים במדיניות הפרטיות</h2>
      <p className="mb-4">
        אנו שומרים לעצמנו את הזכות לשנות את המדיניות לפי הצורך. במקרה של שינוי מהותי תישלח הודעה מתאימה ויפורסם תאריך העדכון האחרון.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2 text-indigo-700">10. יצירת קשר</h2>
      <p>
        לשאלות, בירורים או בקשות, ניתן לפנות אלינו לכתובת: <a className="text-blue-600 underline" href="mailto:admin@magicsale.co.il">admin@magicsale.co.il</a> או בטופס <a href="/landing#contact" className="text-blue-600 underline">צור קשר</a>.
      </p>
    </div>
  );
}
