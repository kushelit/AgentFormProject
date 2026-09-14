import Link from 'next/link';

export default function MagicTouchPrivacyPage() {
  return (
    <main
      dir="rtl"
      className="relative min-h-screen overflow-hidden bg-[#070a18] text-slate-100"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#070a18] via-[#101838] to-[#24164a]" />
      <div className="pointer-events-none absolute -right-40 top-20 h-[520px] w-[520px] rounded-full bg-cyan-400/10 blur-[130px]" />
      <div className="pointer-events-none absolute -left-40 top-[35%] h-[520px] w-[520px] rounded-full bg-violet-500/15 blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/MagicTouchLanding"
            className="group"
          >
            <div className="text-2xl font-semibold text-white">
              MagicTouch
            </div>

            <div className="mt-0.5 text-sm text-cyan-300">
              Smart Process Automation
            </div>

            <div className="mt-1 text-xs text-slate-400">
              מבית Unamix
            </div>
          </Link>

          <Link
            href="/MagicTouchLanding"
            className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/15"
          >
            חזרה ל-MagicTouch
          </Link>
        </header>

        <section className="mb-8 rounded-[32px] border border-violet-300/15 bg-gradient-to-l from-cyan-300/10 via-white/[0.06] to-violet-400/10 p-7 md:p-10">
          <div className="mb-3 inline-flex rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-sm text-violet-200">
            פרטיות ואבטחת מידע
          </div>

          <h1 className="text-3xl font-semibold md:text-4xl">
            מדיניות הפרטיות של MagicTouch
          </h1>

          <p className="mt-4 max-w-3xl leading-7 text-slate-300">
            כאן מוסבר איזה מידע עשוי להיות מעובד במסגרת MagicTouch,
            לרבות באתר ובאפליקציית המובייל, מדוע הוא נדרש וכיצד אנו
            פועלים לשמירה עליו.
          </p>

          <p className="mt-3 text-sm text-slate-400">
            עודכן לאחרונה: 13.9.2026
          </p>
        </section>

        <div className="space-y-5">
          <LegalSection title="1. כללי ומי אנחנו">
            <p>
              <strong>MagicTouch</strong> מופעלת ומפותחת על ידי{' '}
              <strong>
                יונמיקס פתרונות טכנולוגיים בע&quot;מ
                {' '}
                (ח.פ. 517213120)
              </strong>
              .
              אנו מכבדים את פרטיות המשתמשים ופועלים בהתאם לדין החל
              בישראל, לרבות חוק הגנת הפרטיות והתקנות מכוחו.
            </p>

            <p>
              מדיניות זו מסבירה את עיבוד המידע במסגרת אתר MagicTouch,
              ההרשמה לשירות, מערכת MagicTouch ואפליקציית MagicTouch
              למכשירים ניידים.
            </p>

            <p>
              ליצירת קשר בענייני פרטיות:{' '}
              <a
                className="text-cyan-300 underline"
                href="mailto:admin@magicsale.co.il"
              >
                admin@magicsale.co.il
              </a>
              .
            </p>
          </LegalSection>

          <LegalSection title="2. סוגי המידע במערכת">
            <p>
              במסגרת השירות עשויים להיות מעובדים שני סוגים מרכזיים
              של מידע:
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard title="מידע על המנוי והמשתמשים">
                שם, פרטי קשר, פרטי עסק, סוג מנוי, הרשאות, נתוני
                התחברות, מידע תפעולי ונתונים הנדרשים לניהול החשבון,
                המשתמשים והתשלום.
              </InfoCard>

              <InfoCard title="מידע שהעסק מנהל על לקוחותיו">
                פרטי קשר, תוכן תקשורת, סטטוסים, פגישות, אירועים,
                משימות, מסמכים, מידע שנקלט מאינטגרציות ונתונים
                הנדרשים להפעלת תהליכי העבודה שהוגדרו על ידי המשתמש.
              </InfoCard>
            </div>
          </LegalSection>

          <LegalSection title="3. מידע שנמסר בעת הרשמה ותשלום">
            <p>
              בעת הרשמה עשויים להיאסף שם מלא, דוא&quot;ל, טלפון,
              תעודת זהות או ח.פ., התוכנית שנבחרה, תוספות למנוי
              ופרטים הנדרשים לניהול ההתקשרות.
            </p>

            <p>
              פרטי אמצעי התשלום עצמם מעובדים באמצעות ספק התשלום
              החיצוני ואינם נדרשים להישמר במערכת MagicTouch
              כפרטי כרטיס מלאים.
            </p>
          </LegalSection>

          <LegalSection title="4. מידע על לקוחות העסק">
            <p>
              MagicTouch מאפשרת למשתמש לנהל מידע הנוגע ללקוחותיו.
              המידע עשוי להגיע מהזנה ידנית, מהודעות ותקשורת,
              מהעלאת מסמכים, ממערכות חיצוניות שהמשתמש בחר לחבר
              או מתהליכים אוטומטיים שהופעלו עבור העסק.
            </p>

            <p>
              המשתמש אחראי לכך שיש לו בסיס והרשאה מתאימים לאיסוף,
              לשימוש, לשמירה ולהעברה של מידע זה ולשימוש בו במסגרת
              התהליכים שהוא מפעיל.
            </p>
          </LegalSection>

          <LegalSection title="5. WhatsApp ותקשורת">
            <p>
              כאשר מחובר ל-MagicTouch חשבון WhatsApp Business או
              ערוץ תקשורת אחר, המערכת עשויה לעבד פרטי שולח ונמען,
              מספרי טלפון, תוכן הודעות, תגובות להודעות, קבצים
              ומדיה שנשלחו בשיחה, זמני שליחה וקבלה, סטטוסי מסירה
              וקריאה ומידע תפעולי הקשור לשיחה.
            </p>

            <p>
              מידע מסוים מועבר גם לספק התקשורת הרלוונטי בהתאם
              לאופן פעולת השירות ולמדיניות שלו.
            </p>
          </LegalSection>

          <LegalSection title="6. יומנים, פגישות ואירועים">
            <p>
              כאשר המשתמש מחבר יומן או מערכת לקביעת פגישות,
              MagicTouch עשויה לקבל ולעבד מידע הדרוש לזיהוי פגישה,
              מועדה, סטטוסה והקשר שלה ללקוח או לתהליך.
            </p>

            <p>
              היקף המידע תלוי בהרשאות שהמשתמש העניק לספק החיצוני
              ול-MagicTouch.
            </p>
          </LegalSection>

          <LegalSection title="7. מסמכים, תמונות, סרטונים וקבצים">
            <p>
              כאשר המשתמש או לקוח מטעמו מעלים מסמכים, תמונות,
              סרטונים או קבצים באמצעות יכולות המערכת, הקבצים
              והמטא-דאטה הנלווה להם עשויים להישמר לצורך התהליך
              העסקי שבמסגרתו הועלו או נשלחו.
            </p>

            <p>
              על המשתמש להימנע מבקשת מידע שאינו נדרש לתהליך
              ולוודא כי הוא מוסמך לקבל, לעבד ולשמור את המידע
              והמסמכים המבוקשים.
            </p>
          </LegalSection>

          <LegalSection title="8. הרשאות באפליקציית MagicTouch">
            <p>
              אפליקציית MagicTouch עשויה לבקש גישה ליכולות מסוימות
              במכשיר הנייד כאשר המשתמש בוחר להשתמש בפעולות
              המחייבות אותן.
            </p>

            <ul className="list-disc space-y-2 pr-5">
              <li>
                <strong>מצלמה</strong> — לצורך צילום ושליחת תמונה
                במסגרת שיחה או תהליך.
              </li>

              <li>
                <strong>תמונות וסרטונים</strong> — לצורך בחירת
                מדיה מהמכשיר ושליחתה באמצעות MagicTouch.
              </li>

              <li>
                <strong>קבצים ומסמכים</strong> — לצורך בחירת
                מסמך שהמשתמש מבקש לצרף או לשלוח.
              </li>
            </ul>

            <p>
              הרשאות אלה משמשות לצורך הפעולה שהמשתמש יזם.
              MagicTouch אינה מבצעת סריקה כללית של התמונות,
              הסרטונים או הקבצים במכשיר.
            </p>

            <p>
              המשתמש יכול לשנות או לבטל הרשאות דרך הגדרות המכשיר.
              ביטול הרשאה עשוי למנוע שימוש בפונקציות מסוימות
              התלויות בה, אך אינו בהכרח מונע שימוש בשאר חלקי
              האפליקציה.
            </p>
          </LegalSection>

          <LegalSection title="9. מטרות השימוש במידע">
            <ul className="list-disc space-y-2 pr-5">
              <li>
                יצירה וניהול של חשבון המשתמש והמנוי.
              </li>

              <li>
                הפעלת אנשי קשר, שיחות, תהליכים, משימות,
                פגישות ואוטומציות.
              </li>

              <li>
                ביצוע פעולות שהמשתמש הגדיר או ביקש באמצעות
                המערכת.
              </li>

              <li>
                חיבור וסנכרון עם שירותים חיצוניים שהמשתמש
                בחר להפעיל.
              </li>

              <li>
                שמירת היסטוריית פעילות הנדרשת לצורך המשך
                העבודה והתהליך העסקי.
              </li>

              <li>
                אבטחה, איתור תקלות, מניעת שימוש לרעה
                ותמיכה טכנית.
              </li>

              <li>
                שיפור השירות, בכפוף לדין ולהגדרות
                הרלוונטיות.
              </li>

              <li>
                עמידה בחובות חוקיות ורגולטוריות החלות עלינו.
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="10. שירותים וספקים חיצוניים">
            <p>
              לצורך מתן השירות אנו עשויים להסתייע בספקי תשתית,
              אחסון, אימות, תשלומים ותקשורת. בנוסף, המשתמש יכול
              לבחור לחבר שירותים חיצוניים בהתאם ליכולות הזמינות
              בחשבונו.
            </p>

            <p>
              בין השירותים שעשויים להיות רלוונטיים בהתאם לשימוש
              בפועל: Firebase ו-Google Cloud לצורכי תשתית, אימות
              ואחסון; GROW לצורכי תשלום; Meta ו-WhatsApp לצורכי
              תקשורת; Microsoft או Google לצורכי יומן ופגישות;
              ושירותים מקצועיים נוספים שהמשתמש בחר לחבר.
            </p>

            <p>
              העברת מידע לספק חיצוני נעשית ככל שנדרש להפעלת
              השירות או האינטגרציה ובהתאם להרשאות, להגדרות
              ולשירותים שהמשתמש בחר להפעיל.
            </p>
          </LegalSection>

          <LegalSection title="11. העברת מידע מחוץ לישראל">
            <p>
              חלק מספקי התשתית והשירותים החיצוניים עשויים לעבד
              או לאחסן מידע בשרתים מחוץ לישראל.
            </p>

            <p>
              במקרים אלה העברת המידע תיעשה בהתאם לדין החל
              ולהסדרים של הספק הרלוונטי.
            </p>
          </LegalSection>

          <LegalSection title="12. שיתוף מידע">
            <p>
              איננו מוכרים מידע אישי.
            </p>

            <p>
              מידע עשוי להיות מועבר לספקים הנדרשים להפעלת
              השירות, לשירותים שהמשתמש בחר לחבר, לרשויות כאשר
              קיימת חובה חוקית או במקרים אחרים המותרים על פי דין.
            </p>
          </LegalSection>

          <LegalSection title="13. אבטחת מידע">
            <p>
              אנו מיישמים אמצעים טכנולוגיים וארגוניים שנועדו
              לצמצם סיכוני גישה, שימוש, שינוי או חשיפה בלתי
              מורשים.
            </p>

            <p>
              הגישה למידע מוגבלת בהתאם לצורך ולהרשאות.
              המערכת עושה שימוש, בין היתר, במנגנוני אימות,
              הפרדת הרשאות משתמשים וסוכנויות ואמצעי אבטחה
              של ספקי התשתית שבהם נעשה שימוש.
            </p>

            <p>
              עם זאת, אין מערכת המחוברת לאינטרנט שיכולה להבטיח
              אבטחה מוחלטת, ולכן אין באפשרותנו להתחייב כי אירוע
              אבטחה לעולם לא יתרחש.
            </p>
          </LegalSection>

          <LegalSection title="14. שמירת מידע">
            <p>
              מידע נשמר כל עוד הוא נדרש לצורך מתן השירות,
              ניהול החשבון, ביצוע תהליכים עסקיים, תמיכה,
              אבטחה, עמידה בחובות חוקיות או מטרות לגיטימיות
              אחרות.
            </p>

            <p>
              משך השמירה עשוי להשתנות לפי סוג המידע, מצב החשבון,
              דרישות הדין והאינטגרציה שממנה התקבל המידע.
            </p>

            <p>
              הפסקת שימוש בשירות, ביטול מנוי, סגירת גישה של משתמש
              או ניתוק אינטגרציה אינם מביאים בהכרח למחיקה מיידית
              של כלל המידע ממערכות MagicTouch, מגיבויים או ממערכות
              של ספקים חיצוניים.
            </p>

            <p>
              מידע מסוים עשוי להמשיך להישמר כאשר הדבר נדרש לצורך
              תפעול השירות, שמירת היסטוריה עסקית, אבטחה, תמיכה,
              עמידה בחובות חוקיות או מטרות לגיטימיות אחרות.
            </p>
          </LegalSection>

          <LegalSection title="15. זכויות ביחס למידע">
            <p>
              ניתן לפנות אלינו בבקשות לעיון או לתיקון מידע אישי,
              וכן בבקשות נוספות ביחס למידע, בהתאם לזכויות
              הקבועות בדין ובכפוף לחריגים החלים בו.
            </p>

            <p>
              כאשר הבקשה נוגעת למידע על לקוח שמנוהל במערכת
              על ידי עסק המשתמש ב-MagicTouch, ייתכן שנפנה את
              הפונה לעסק הרלוונטי או שנתאם את הטיפול עמו,
              בהתאם לנסיבות ולדין.
            </p>
          </LegalSection>

          <LegalSection title="16. סגירת גישה, מחיקת משתמש ובקשות ביחס למידע">
            <p>
              משתמש המבקש להפסיק את השימוש בשירות, לסגור את
              הגישה לחשבונו או להגיש בקשה ביחס למידע אישי יכול
              לפנות אלינו בדוא&quot;ל:
              {' '}
              <a
                className="text-cyan-300 underline"
                href="mailto:admin@magicsale.co.il"
              >
                admin@magicsale.co.il
              </a>
              .
            </p>

            <p>
              חשבון המשתמש במערכת מבוסס, בין היתר, על מנגנון
              הזדהות באמצעות Firebase Authentication.
              סגירת גישת משתמש או ביטול אפשרות ההתחברות אינם
              מביאים בהכרח למחיקה אוטומטית של כלל המידע העסקי,
              ההיסטורי או התפעולי המשויך לחשבון, לארגון,
              לסוכנות או ללקוחות העסק.
            </p>

            <p>
              כאשר חשבון MagicTouch משמש סוכנות, ארגון או עסק
              הכוללים מספר משתמשים, מידע שנוצר או נשמר במסגרת
              פעילות הארגון עשוי להיות משויך לארגון עצמו ולא
              למשתמש יחיד בלבד.
            </p>

            <p>
              לפיכך, מחיקת משתמש או חסימת אפשרות ההתחברות שלו
              אינה בהכרח גורמת למחיקת שיחות, לקוחות, מסמכים,
              תהליכים, היסטוריית פעילות או מידע עסקי אחר
              המשויך לסוכנות או לארגון.
            </p>

            <p>
              מידע מסוים עשוי להישמר גם לאחר סגירת הגישה ככל
              שהדבר נדרש לצורך תפעול המערכת, אבטחה, תיעוד,
              שמירת היסטוריה עסקית, טיפול במחלוקות, עמידה
              בחובות חוקיות או מטרות לגיטימיות אחרות.
            </p>

            <p>
              בקשות לעיון, תיקון או מחיקה של מידע אישי ייבחנו
              בהתאם לדין, לסוג המידע, למטרת שמירתו ולמעמד
              הפונה ביחס למידע.
            </p>

            <p>
              כאשר מדובר במידע עסקי או במידע של לקוחות המנוהל
              במסגרת חשבון של סוכנות או ארגון, ייתכן שלא ניתן
              יהיה למחוק את המידע כולו לפי בקשת משתמש יחיד.
            </p>

            <p>
              ביטול מנוי או הפסקת תשלום אינם שקולים למחיקה
              מלאה של חשבון המשתמש או של כלל המידע הנשמר
              במסגרת השירות.
            </p>
          </LegalSection>

          <LegalSection title="17. Cookies, אחסון מקומי, לוגים ואנליטיקה">
            <p>
              אתר MagicTouch והמערכת עשויים להשתמש ב-Cookies,
              אחסון מקומי, לוגים טכניים וכלים דומים לצורך
              התחברות, אבטחה, תפעול, שמירת העדפות וניתוח השימוש.
            </p>

            <p>
              באפליקציית המובייל עשוי להישמר במכשיר מידע טכני
              הנדרש לצורך התחברות, שמירת הפעלה תקינה של החשבון
              ותפעול האפליקציה.
            </p>

            <p>
              ככל שנעשה שימוש בכלי אנליטיקה שאינם חיוניים,
              השימוש בהם ייעשה בהתאם לדין ולהגדרות ההסכמה
              הרלוונטיות.
            </p>
          </LegalSection>

          <LegalSection title="18. שינויים במדיניות">
            <p>
              אנו עשויים לעדכן מדיניות זו מעת לעת בעקבות שינוי
              בשירות, באפליקציה, באינטגרציות, בדרישות הדין
              או מסיבות תפעוליות אחרות.
            </p>

            <p>
              במקרה של שינוי מהותי נפרסם את המדיניות המעודכנת
              ונעדכן את תאריך העדכון המופיע בראש העמוד.
            </p>
          </LegalSection>

          <LegalSection title="19. יצירת קשר">
            <p>
              <strong>
                יונמיקס פתרונות טכנולוגיים בע&quot;מ
              </strong>
              ,
              {' '}
              ח.פ.
              {' '}
              <strong>517213120</strong>
            </p>

            <p>
              עזרא גבאי 3, פתח תקווה, ישראל
            </p>

            <p>
              טלפון:
              {' '}
              <a
                className="text-cyan-300 underline"
                href="tel:0553001487"
              >
                055-300-1487
              </a>
            </p>

            <p>
              דוא&quot;ל:
              {' '}
              <a
                className="text-cyan-300 underline"
                href="mailto:admin@magicsale.co.il"
              >
                admin@magicsale.co.il
              </a>
            </p>

            <p>
              אתר:
              {' '}
              <a
                className="text-cyan-300 underline"
                href="https://www.magicsale.co.il/MagicTouchLanding"
              >
                MagicTouch
              </a>
            </p>
          </LegalSection>
        </div>

        <Footer />
      </div>
    </main>
  );
}

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.07] p-6 shadow-xl backdrop-blur-sm md:p-8">
      <h2 className="mb-4 text-xl font-semibold text-cyan-200">
        {title}
      </h2>

      <div className="space-y-3 leading-8 text-slate-300">
        {children}
      </div>
    </section>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.06] p-5">
      <h3 className="mb-2 font-semibold text-cyan-200">
        {title}
      </h3>

      <p className="text-sm leading-7 text-slate-300">
        {children}
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-10 border-t border-white/10 pt-7 text-center text-sm text-slate-400">
      <p className="font-medium text-slate-300">
        MagicTouch מבית Unamix Technological Solutions
      </p>

      <div className="mt-3 flex flex-wrap justify-center gap-5">
        <Link
          href="/MagicTouchTerms"
          className="text-cyan-300 hover:text-cyan-200"
        >
          תנאי שימוש
        </Link>

        <Link
          href="/MagicTouchLanding"
          className="hover:text-white"
        >
          MagicTouch
        </Link>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        © {new Date().getFullYear()} Unamix. כל הזכויות שמורות.
      </p>
    </footer>
  );
}