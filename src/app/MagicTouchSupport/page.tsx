import Link from 'next/link';

export default function MagicTouchSupportPage() {
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
            תמיכה ושירות
          </div>

          <h1 className="text-3xl font-semibold md:text-4xl">
            תמיכה ב-MagicTouch
          </h1>

          <p className="mt-4 max-w-3xl leading-7 text-slate-300">
            נתקלתם בבעיה בהתחברות, בשיחה, בשליחת הודעה,
            בקובץ, בתבנית WhatsApp או בתהליך?
            אנחנו כאן כדי לעזור.
          </p>
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <SupportCard
            title="תמיכה טכנית"
            description="לבעיות התחברות, שימוש באפליקציה, שיחות WhatsApp, שליחת הודעות, קבצים ותקלות טכניות."
          >
            <a
              href="mailto:admin@magicsale.co.il"
              className="inline-flex rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/15"
            >
              admin@magicsale.co.il
            </a>
          </SupportCard>

          <SupportCard
            title="טלפון ו-WhatsApp"
            description="ניתן לפנות אלינו גם בטלפון או ב-WhatsApp לקבלת תמיכה ושירות."
          >
            <div className="flex flex-wrap gap-3">
              <a
                href="tel:0553001487"
                className="inline-flex rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/15"
              >
                055-300-1487
              </a>

              <a
                href="https://wa.me/972553001487"
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/15"
              >
                פתיחת WhatsApp
              </a>
            </div>
          </SupportCard>
        </div>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.07] p-6 shadow-xl backdrop-blur-sm md:p-8">
          <h2 className="text-xl font-semibold text-cyan-200">
            במה נוכל לעזור?
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <HelpItem
              title="התחברות לחשבון"
              text="קושי בכניסה למערכת, משתמש שאינו פעיל או בעיה בזיהוי החשבון."
            />

            <HelpItem
              title="שיחות WhatsApp"
              text="שליחה או קבלה של הודעות, מדיה, מסמכים, תבניות או סטטוסי הודעות."
            />

            <HelpItem
              title="תהליכים ואוטומציות"
              text="תהליך שלא התקדם, פעולה שלא הופעלה או שיחה שמסומנת כדורשת טיפול."
            />

            <HelpItem
              title="פרטי לקוח"
              text="שאלות בנוגע לכרטיס לקוח, מידע שמוצג במערכת או עדכון פרטים."
            />

            <HelpItem
              title="קבצים ומדיה"
              text="בעיות בצילום, בחירת תמונה, סרטון או מסמך ושליחתם מתוך האפליקציה."
            />

            <HelpItem
              title="הרשאות באפליקציה"
              text="בעיות בגישה למצלמה, לתמונות או לקבצים במכשיר."
            />
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.07] p-6 shadow-xl backdrop-blur-sm md:p-8">
          <h2 className="text-xl font-semibold text-cyan-200">
            כשפונים לתמיכה
          </h2>

          <p className="mt-3 leading-8 text-slate-300">
            כדי שנוכל לטפל בפנייה במהירות, מומלץ לצרף תיאור קצר
            של הבעיה ובמידת האפשר צילום מסך.
          </p>

          <p className="mt-3 leading-8 text-slate-300">
            אין לשלוח סיסמאות, קודי אימות, מפתחות API או מידע
            רגיש שאינו נדרש לצורך הטיפול.
          </p>
        </section>

        <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.07] p-6 shadow-xl backdrop-blur-sm md:p-8">
          <h2 className="text-xl font-semibold text-cyan-200">
            פרטיות, תנאים וחשבון משתמש
          </h2>

          <p className="mt-3 leading-8 text-slate-300">
            לבקשות בנוגע למידע אישי, סגירת גישה למשתמש או נושאי
            פרטיות ניתן לפנות אלינו באמצעות פרטי הקשר המופיעים
            בעמוד זה.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/MagicTouchPrivacy"
              className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/15"
            >
              מדיניות פרטיות
            </Link>

            <Link
              href="/MagicTouchTerms"
              className="rounded-xl border border-violet-300/25 bg-violet-300/10 px-4 py-2 text-sm font-medium text-violet-100 transition hover:bg-violet-300/15"
            >
              תנאי שימוש
            </Link>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-cyan-300/15 bg-gradient-to-l from-cyan-300/10 to-violet-400/10 p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">
            MagicTouch מבית Unamix
          </h2>

          <p className="mt-3 max-w-3xl leading-8 text-slate-300">
            MagicTouch מפותחת ומופעלת על ידי
            {' '}
            <strong className="text-slate-100">
              יונמיקס פתרונות טכנולוגיים בע&quot;מ
            </strong>
            {' '}
            (ח.פ. 517213120).
          </p>

          <div className="mt-5 space-y-2 text-sm text-slate-300">
            <p>עזרא גבאי 3, פתח תקווה, ישראל</p>

            <p>
              דוא&quot;ל:
              {' '}
              <a
                href="mailto:admin@magicsale.co.il"
                className="text-cyan-300 underline"
              >
                admin@magicsale.co.il
              </a>
            </p>

            <p>
              טלפון:
              {' '}
              <a
                href="tel:0553001487"
                className="text-cyan-300 underline"
              >
                055-300-1487
              </a>
            </p>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}

function SupportCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.07] p-6 shadow-xl backdrop-blur-sm md:p-8">
      <h2 className="text-xl font-semibold text-cyan-200">
        {title}
      </h2>

      <p className="mt-3 leading-8 text-slate-300">
        {description}
      </p>

      <div className="mt-5">
        {children}
      </div>
    </section>
  );
}

function HelpItem({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.05] p-5">
      <h3 className="font-semibold text-cyan-200">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-7 text-slate-300">
        {text}
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
          href="/MagicTouchPrivacy"
          className="text-cyan-300 hover:text-cyan-200"
        >
          מדיניות פרטיות
        </Link>

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