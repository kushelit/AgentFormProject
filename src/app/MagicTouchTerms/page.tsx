import Link from 'next/link';

export default function MagicTouchTermsPage() {
  return (
    <main dir="rtl" className="relative min-h-screen overflow-hidden bg-[#070a18] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#070a18] via-[#101838] to-[#24164a]" />
      <div className="pointer-events-none absolute -right-40 top-20 h-[520px] w-[520px] rounded-full bg-cyan-400/10 blur-[130px]" />
      <div className="pointer-events-none absolute -left-40 top-[35%] h-[520px] w-[520px] rounded-full bg-violet-500/15 blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-5xl px-5 py-8 md:px-8 md:py-12">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <Link href="/MagicTouchLanding" className="group">
            <div className="text-2xl font-semibold text-white">MagicTouch</div>
            <div className="mt-0.5 text-sm text-cyan-300">Smart Process Automation</div>
            <div className="mt-1 text-xs text-slate-400">מבית Unamix</div>
          </Link>
          <Link href="/MagicTouchLanding" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/15">
            חזרה ל-MagicTouch
          </Link>
        </header>

        <section className="mb-8 rounded-[32px] border border-cyan-300/15 bg-gradient-to-l from-cyan-300/10 via-white/[0.06] to-violet-400/10 p-7 md:p-10">
          <div className="mb-3 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-sm text-cyan-200">
            מסמך משפטי
          </div>
          <h1 className="text-3xl font-semibold md:text-4xl">תנאי השימוש במערכת MagicTouch</h1>
          <p className="mt-4 max-w-3xl leading-7 text-slate-300">
            תנאים אלה מסדירים את השימוש ב-MagicTouch, מערכת לניהול תקשורת, תהליכים ואוטומציות מול לקוחות.
          </p>
          <p className="mt-3 text-sm text-slate-400">עודכן לאחרונה: 20.8.2026</p>
        </section>

        <div className="space-y-5">
          <LegalSection title="1. כללי">
            <p>תנאים אלה, יחד עם <Link className="text-cyan-300 underline" href="/MagicTouchPrivacy">מדיניות הפרטיות של MagicTouch</Link>, מהווים הסכם משפטי מחייב בינך לבין <strong>יונמיקס פתרונות טכנולוגיים בע&quot;מ (ח.פ. 517213120)</strong>, המפתחת ומפעילה את MagicTouch.</p>
            <p>השימוש באתר, במערכת או בשירותים הנלווים לה מהווה הסכמה לתנאים אלה. אם אינך מסכים להם, יש להימנע מהשימוש בשירות.</p>
            <p>החברה רשאית לבצע עדכונים, שדרוגים, תחזוקה ותיקונים, ולפיכך ייתכנו מעת לעת הפסקות או מגבלות זמינות.</p>
          </LegalSection>

          <LegalSection title="2. השירות">
            <p>MagicTouch היא מערכת תוכנה המאפשרת, בין היתר, לנהל אנשי קשר, תקשורת עם לקוחות, תהליכי עבודה, אירועים, משימות, פגישות, מסמכים ואוטומציות, וכן להתחבר לשירותים ומערכות חיצוניים.</p>
            <p>היכולות הזמינות בפועל תלויות בסוג המנוי, בהרשאות המשתמש, בהגדרות העסק ובאינטגרציות שחוברו לחשבון.</p>
          </LegalSection>

          <LegalSection title="3. הרשמה, חשבון והרשאות">
            <p>לצורך פתיחת חשבון עשויים להידרש פרטים כגון שם, טלפון, דוא&quot;ל ותעודת זהות או ח.פ. המשתמש מתחייב למסור מידע נכון ועדכני ולשמור בסוד את אמצעי ההתחברות שלו.</p>
            <p>במנויים המאפשרים עובדים נוספים, בעל החשבון אחראי למתן ההרשאות לעובדיו ולפעולות המבוצעות באמצעות החשבון הארגוני.</p>
            <p>השימוש בשירות מיועד לבני 18 ומעלה.</p>
          </LegalSection>

          <LegalSection title="4. מידע על לקוחות ואחריות המשתמש">
            <p>MagicTouch מיועדת לעבודה עם מידע שהמשתמש מזין, מעלה, מקבל או מסנכרן בקשר ללקוחותיו. המשתמש אחראי לכך שהוא רשאי כדין לאסוף, לשמור, לעבד ולהעביר מידע זה באמצעות המערכת ובאמצעות השירותים החיצוניים שהוא בוחר לחבר אליה.</p>
            <p>המשתמש אחראי לתוכן ההודעות, המסמכים, הנתונים וההנחיות המוזנים למערכת, ולבחירת הנמענים שאליהם מבוצעת פנייה.</p>
          </LegalSection>

          <LegalSection title="5. אוטומציות ופעולות בשם העסק">
            <p>המערכת מאפשרת להגדיר תהליכים אוטומטיים (Flows) ופעולות שעשויות להתבצע בעקבות טריגרים, אירועים או מידע שמתקבל ממערכות מחוברות. פעולות אלה עשויות לכלול שליחת הודעות, עדכון סטטוסים, יצירת משימות, בקשת מסמכים או הפעלת אינטגרציות.</p>
            <p>האחריות לבחירת התהליך, להגדרתו, לתוכן שנשלח ולהרשאות שניתנו למערכת מוטלת על המשתמש. מומלץ לבדוק תהליכים והגדרות לפני הפעלתם בסביבת עבודה פעילה.</p>
          </LegalSection>

          <LegalSection title="6. WhatsApp ושירותי תקשורת">
            <p>כאשר המשתמש מחבר חשבון WhatsApp Business או שירות תקשורת אחר, השימוש בו כפוף גם לתנאים, למדיניות ולהרשאות של ספק השירות הרלוונטי. המשתמש אחראי לעמידה בכללי הפנייה ללקוחות, לקבלת הסכמות ככל שנדרש ולשימוש תקין בתבניות ובהודעות.</p>
            <p>יונמיקס אינה שולטת בזמינות, באישור תבניות, בחסימות, במגבלות חשבון או בהחלטות אחרות של ספקי התקשורת.</p>
          </LegalSection>

          <LegalSection title="7. אינטגרציות ושירותים חיצוניים">
            <p>MagicTouch עשויה להתחבר, בהתאם להגדרות המשתמש וליכולות המוצר, לשירותים חיצוניים כגון Meta/WhatsApp, Microsoft, Google ושירותים מקצועיים נוספים. חלק מהשירותים עשויים להשתנות מעת לעת.</p>
            <p>הפעלת אינטגרציה כפופה להרשאות ולתנאי הספק החיצוני. תקלה, שינוי API, ביטול הרשאה, השבתה או מגבלה אצל ספק חיצוני עלולים להשפיע על פעולת MagicTouch, והחברה אינה מתחייבת לזמינותם הרציפה של שירותים שאינם בשליטתה.</p>
          </LegalSection>

          <LegalSection title="8. מסמכים ותוכן">
            <p>ככל שהמערכת מאפשרת העלאת מסמכים, תמונות, הערות או מידע אחר, המשתמש מצהיר כי הוא מוסמך להעלותם ולעבדם. אין להעלות תוכן בלתי חוקי, מזיק, מפר זכויות או תוכן שאין למשתמש הרשאה להחזיק או לעבד.</p>
          </LegalSection>

          <LegalSection title="9. פעילות אסורה וקניין רוחני">
            <p>אין להעתיק, לשכפל, להפיץ, לבצע הנדסה לאחור, לנסות לחדור למערכת, לשבש את פעולתה או לעשות בה שימוש בלתי חוקי. אין לבצע שליפה אוטומטית של מידע או שימוש מסחרי בקוד, בעיצוב או בתוכן ללא אישור מראש ובכתב.</p>
            <p>כל הזכויות במערכת, בקוד, בעיצוב, במותגים ובתכנים של MagicTouch ו-Unamix שמורות ליונמיקס פתרונות טכנולוגיים בע&quot;מ או לבעלי הזכויות הרלוונטיים.</p>
          </LegalSection>

          <LegalSection title="10. אחריות השירות והגבלת אחריות">
            <p>השירות ניתן כפי שהוא (&quot;AS IS&quot;) וככל שהוא זמין (&quot;AS AVAILABLE&quot;). החברה אינה מתחייבת שהשירות יהיה רציף, נטול תקלות או מתאים לכל צורך עסקי מסוים.</p>
            <p>MagicTouch היא כלי תפעולי ואוטומטי ואינה תחליף לשיקול דעת מקצועי, משפטי, חשבונאי, ביטוחי או רגולטורי. המשתמש אחראי לבדוק מידע, פעולות ותוצרים לפני הסתמכות עליהם.</p>
            <p>בכפוף לדין, החברה לא תהיה אחראית לנזק עקיף, אובדן מידע, אובדן הכנסה או תוצאה עסקית שנגרמו עקב שימוש במערכת, הגדרה שגויה, מידע שהוזן על ידי המשתמש או תקלה בשירות חיצוני.</p>
          </LegalSection>

          <LegalSection title="11. מנויים, חיוב ושינוי תוכנית">
            <p>MagicTouch מוצעת במסלולי מנוי כפי שמפורסם במועד ההצטרפות, לרבות מנוי MagicTouch ומסלול משולב MagicSale + MagicTouch. תוספות כגון עובדים נוספים עשויות להיות כרוכות בתשלום נוסף.</p>
            <p>החיוב מתבצע באמצעות ספק סליקה חיצוני. המשתמש רשאי, בהתאם לאפשרויות המוצגות בחשבונו, לשנות תוכנית, לעדכן אמצעי תשלום או לבטל את המנוי.</p>
          </LegalSection>

          <LegalSection title="12. ביטול עסקה והחזר תשלום">
            <p>ניתן לבטל את המינוי בהתאם לאפשרויות ניהול המנוי במערכת. הביטול יפסיק חיובים עתידיים בהתאם למועד כניסתו לתוקף.</p>
            <p>זכויות ביטול והחזר יינתנו בהתאם לדין החל ולתנאים שהוצגו במועד ההתקשרות. ככל שניתנה זכאות להחזר, ההחזר יבוצע באמצעי התשלום המקורי ובהתאם לזמני הטיפול של ספק התשלום.</p>
          </LegalSection>

          <LegalSection title="13. אספקת השירות">
            <p>לאחר אישור התשלום ויצירת החשבון תינתן גישה בהתאם למסלול שנרכש. חלק מיכולות MagicTouch מחייבות תהליך חיבור והגדרה של שירותים חיצוניים, ולכן ייתכן שלא כל היכולות יהיו פעילות מיד עם יצירת החשבון.</p>
          </LegalSection>

          <LegalSection title="14. חסימת גישה וסיום שירות">
            <p>החברה רשאית להגביל או לחסום גישה במקרה של הפרת תנאים אלה, שימוש בלתי חוקי, סיכון אבטחה, אי-תשלום או פעולה העלולה לפגוע במערכת, במשתמשים אחרים או בצדדים שלישיים.</p>
          </LegalSection>

          <LegalSection title="15. שינויים בתנאים">
            <p>יונמיקס רשאית לעדכן תנאים אלה מעת לעת. במקרה של שינוי מהותי יפורסם נוסח מעודכן ויעודכן מועד השינוי. המשך השימוש לאחר כניסת העדכון לתוקף מהווה הסכמה לתנאים המעודכנים, בכפוף לדין.</p>
          </LegalSection>

          <LegalSection title="16. דין וסמכות שיפוט">
            <p>על תנאים אלה יחולו דיני מדינת ישראל. סמכות השיפוט תהיה לבתי המשפט המוסמכים בישראל, בהתאם לדין.</p>
          </LegalSection>

          <LegalSection title="17. פרטי החברה ויצירת קשר">
            <p><strong>יונמיקס פתרונות טכנולוגיים בע&quot;מ</strong>, ח.פ. <strong>517213120</strong></p>
            <p>עזרא גבאי 3, פתח תקווה, ישראל</p>
            <p>טלפון: <a className="text-cyan-300 underline" href="tel:0553001487">055-300-1487</a></p>
            <p>דוא&quot;ל: <a className="text-cyan-300 underline" href="mailto:admin@magicsale.co.il">admin@magicsale.co.il</a></p>
          </LegalSection>
        </div>

        <Footer />
      </div>
    </main>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.07] p-6 shadow-xl backdrop-blur-sm md:p-8">
      <h2 className="mb-4 text-xl font-semibold text-cyan-200">{title}</h2>
      <div className="space-y-3 leading-8 text-slate-300">{children}</div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-10 border-t border-white/10 pt-7 text-center text-sm text-slate-400">
      <p className="font-medium text-slate-300">MagicTouch מבית Unamix Technological Solutions</p>
      <div className="mt-3 flex flex-wrap justify-center gap-5">
        <Link href="/MagicTouchPrivacy" className="text-cyan-300 hover:text-cyan-200">מדיניות פרטיות</Link>
        <Link href="/MagicTouchLanding" className="hover:text-white">MagicTouch</Link>
      </div>
      <p className="mt-4 text-xs text-slate-500">© {new Date().getFullYear()} Unamix. כל הזכויות שמורות.</p>
    </footer>
  );
}
