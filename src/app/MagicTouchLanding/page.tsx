'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

import {
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  FileText,
  MessageCircle,
  RefreshCw,
  UserRound,
  Workflow,
  Zap,
} from 'lucide-react';

const integrations = [
  'Surense',
  'Roeto',
  'Polywiz',
  'WhatsApp',
  'יומנים',
  'MagicSale',
];

const threePillars = [
  {
    icon: MessageCircle,
    title: 'תקשורת אוטומטית עם הלקוח',
    text:
      'שליחת הודעות WhatsApp, קישורים, תזכורות ובקשות מסמכים — בהתאם למה שקורה בתהליך.',
  },
  {
    icon: Workflow,
    title: 'תהליך שמתקדם לפי מה שקורה',
    text:
      'נקבעה פגישה? התקבלה חתימה? הגיע מידע? MagicTouch יודעת להמשיך לשלב הבא.',
  },
  {
    icon: RefreshCw,
    title: 'חיבור למערכות המקצועיות של המשרד',
    text:
      'Surense, Roeto, Polywiz, MagicSale ומערכות נוספות יכולות להיות חלק מאותו תהליך עבודה.',
  },
];

const simpleFlow = [
  {
    icon: MessageCircle,
    title: 'תקשורת עם הלקוח',
    text: 'WhatsApp, הודעות, קישורים ותזכורות',
  },
  {
    icon: CalendarDays,
    title: 'קביעת פגישה',
    text: 'שליחת קישור וקבלת האירוע מהיומן',
  },
  {
    icon: FileText,
    title: 'מסמכים וייפוי כוח',
    text: 'שליחה, בקשה והמתנה למה שהלקוח צריך להשלים',
  },
  {
    icon: RefreshCw,
    title: 'בדיקת סטטוסים',
    text: 'חתימה, מידע שהתקבל או אירוע ממערכת אחרת',
  },
  {
    icon: CheckCircle2,
    title: 'המשך טיפול',
    text: 'אוטומטית — או לעובד כשבאמת צריך אותו',
  },
];

const manualVsMagic = [
  {
    manual: 'מתכתבים עם הלקוח כדי למצוא מועד לפגישה',
    magic: 'נשלח קישור לקביעת פגישה והלקוח בוחר מועד בעצמו',
  },
  {
    manual: 'נכנסים למערכת כדי לשלוח ייפוי כוח או בקשה למידעים',
    magic: 'הבקשה נשלחת אוטומטית כשהפגישה נקבעת',
  },
  {
    manual: 'נכנסים שוב לבדוק אם הלקוח חתם',
    magic: 'MagicTouch ממתינה לעדכון ויודעת כשהחתימה התקבלה',
  },
  {
    manual: 'בודקים שוב ושוב אם המידעים כבר הגיעו',
    magic: 'כשהמידעים מתקבלים — התהליך ממשיך לשלב הבא',
  },
];

export default function MagicTouchLandingPage() {
  const router = useRouter();

  const scrollToContact = () => {
    document
      .getElementById('contact')
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToHowItWorks = () => {
    document
      .getElementById('how-it-works')
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div dir="rtl" className="min-h-screen overflow-hidden bg-white text-right">
      <section className="relative overflow-hidden bg-[#050817] text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-[#050817] via-[#0b1230] to-[#211449]" />
        <div className="absolute -right-32 top-20 h-[520px] w-[520px] rounded-full bg-purple-500/15 blur-[130px]" />
        <div className="absolute -left-20 bottom-0 h-[420px] w-[420px] rounded-full bg-cyan-400/10 blur-[130px]" />

        <div className="relative z-10 mx-auto max-w-7xl px-6 pb-8 pt-5 md:px-10">
          <motion.header
            className="flex items-center justify-between"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3">
              <Image
                src="/static/img/landingImg/union-5.png"
                alt="MagicSale"
                width={150}
                height={40}
                className="h-auto w-28 sm:w-36"
              />

              <div className="hidden h-7 w-px bg-white/20 md:block" />

              <div className="hidden md:block">
                <div className="text-base font-semibold">MagicTouch</div>
                <div className="text-sm text-cyan-200/70">
                  Smart Process Automation
                </div>
                <a
                  href="https://www.unamix.co.il/"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs font-semibold text-slate-400 transition hover:text-cyan-200"
                >
                  מבית Unamix
                </a>
              </div>
            </div>

            <div className="hidden items-center gap-5 text-sm font-medium text-slate-300 lg:flex">
              <a href="#how-it-works" className="transition hover:text-white">איך זה עובד</a>
              <a href="#insurance" className="transition hover:text-white">חיבורים</a>
              <a href="#magic-family" className="transition hover:text-white">MagicSale</a>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/auth/log-in"
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10"
              >
                כניסה למערכת
              </Link>

              <button
                onClick={() => router.push('/MagicTouchSignUp')}
                className="hidden rounded-xl bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 sm:block"
              >
                הצטרפו ל-MagicTouch
              </button>
            </div>
          </motion.header>

          <div className="grid min-h-[650px] items-center gap-12 py-14 lg:grid-cols-[1fr_0.9fr]">
            <motion.div
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="mb-5 text-base font-semibold text-cyan-300 md:text-lg">
                תקשורת אוטומטית עם הלקוח. תהליך שממשיך אחריה.
              </div>

              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.12] sm:text-5xl lg:text-6xl">
                מהודעת WhatsApp
                <br />
                ועד לסיום הטיפול —
                <br />
                <span className="text-cyan-300">
                  MagicTouch מנהלת את התהליך.
                </span>
              </h1>

              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
                הודעות ללקוח, קביעת פגישות, בקשות מסמכים,
                ייפויי כוח, מעקב אחרי חתימות ומידעים
                ופעולות במערכות המקצועיות של המשרד —
                בתוך תהליך אחד.
              </p>

              <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-cyan-200">
                MagicTouch מבצעת את מה שאפשר אוטומטית,
                ומעבירה לעובד רק את מה שבאמת דורש אותו.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => router.push('/MagicTouchSignUp')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-7 py-3.5 font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  הצטרפו ל-MagicTouch
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <button
                  onClick={scrollToHowItWorks}
                  className="rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 font-medium text-white transition hover:bg-white/10"
                >
                  מה המערכת עושה בפועל?
                </button>
              </div>
            </motion.div>

            <motion.div
              className="relative mx-auto w-full max-w-[420px]"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <div className="absolute inset-0 rounded-[40px] bg-cyan-400/10 blur-3xl" />

              <div className="relative rounded-[34px] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold">תהליך לקוח</div>
                    <div className="mt-1 text-sm text-slate-300">דוגמה לתהליך אוטומטי</div>
                  </div>

                  <div className="flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-sm font-medium text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    פעיל
                  </div>
                </div>

                <HeroFlowStep icon={MessageCircle} title="נשלחת הודעה ללקוח" text="WhatsApp / תבנית / קישור" />
                <HeroConnector />
                <HeroFlowStep icon={CalendarDays} title="הלקוח קובע פגישה" text="MagicTouch מקבלת את האירוע מהיומן" />
                <HeroConnector />
                <HeroFlowStep icon={FileText} title="נשלחת בקשת מסמכים / ייפוי כוח" text="בהתאם לתהליך שהוגדר" />
                <HeroConnector />
                <HeroFlowStep icon={RefreshCw} title="המערכת ממתינה לתוצאה" text="חתימה, מסמכים או מידעים" waiting />
                <HeroConnector />
                <HeroFlowStep icon={CheckCircle2} title="האירוע התקבל — ממשיכים" text="אוטומטית לשלב הבא" success />
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-3 lg:grid-cols-6">
            {integrations.map((item) => (
              <div
                key={item}
                className="flex min-h-14 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-base font-semibold text-slate-200"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-white px-6 py-20 text-slate-900">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <div className="mb-3 text-base font-medium text-indigo-600">מה MagicTouch עושה?</div>
            <h2 className="text-3xl font-semibold leading-tight md:text-5xl">
              שלושה דברים.
              <br />
              זה כל הסיפור.
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {threePillars.map((item, index) => {
              const Icon = item.icon;

              return (
                <motion.div
                  key={item.title}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-8 shadow-sm"
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: index * 0.08 }}
                >
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                    <Icon className="h-7 w-7" />
                  </div>

                  <h3 className="text-2xl font-semibold leading-8">{item.title}</h3>
                  <p className="mt-4 text-lg leading-8 text-slate-600">{item.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#0b1230] px-6 py-20 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 text-center">
            <div className="mb-3 text-base font-medium text-cyan-300">דוגמה פשוטה</div>
            <h2 className="text-3xl font-semibold md:text-5xl">כך תהליך אחד יכול להיראות</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-5">
            {simpleFlow.map((step, index) => {
              const Icon = step.icon;

              return (
                <div key={step.title} className="relative text-center">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-white/[0.06]">
                    <Icon className="h-8 w-8 text-cyan-300" />
                  </div>

                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mx-auto mt-2 max-w-[210px] text-base leading-7 text-slate-300">{step.text}</p>

                  {index < simpleFlow.length - 1 && (
                    <div className="absolute -left-5 top-9 hidden text-2xl text-cyan-300/40 md:block">←</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-6 py-20 text-slate-900">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-14 max-w-4xl text-center">
            <div className="mb-3 text-base font-medium text-indigo-600">מה משתנה ביום העבודה?</div>
            <h2 className="text-3xl font-semibold leading-tight md:text-5xl">
              היום — כל שלב דורש פעולה ידנית.
              <br />
              <span className="text-indigo-600">עם MagicTouch — התהליך מתקדם כשמשהו קורה.</span>
            </h2>
          </div>

          <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
            <div className="grid md:grid-cols-[1fr_1fr]">
              <div className="border-b border-slate-200 p-7 md:border-b-0 md:border-l md:p-9">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                    <UserRound className="h-6 w-6 text-slate-600" />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-slate-500">היום</div>
                    <h3 className="text-2xl font-semibold">פעולות ידניות לאורך כל הדרך</h3>
                  </div>
                </div>

                <div className="space-y-5">
                  {manualVsMagic.map((row, index) => (
                    <div key={row.manual} className="flex items-start gap-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-500">
                        {index + 1}
                      </div>
                      <p className="text-lg leading-8 text-slate-700">{row.manual}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#0b1230] p-7 text-white md:p-9">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400">
                    <Zap className="h-6 w-6 text-slate-950" />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-cyan-300">עם MagicTouch</div>
                    <h3 className="text-2xl font-semibold">אותה עבודה — בלי לרדוף אחרי כל שלב</h3>
                  </div>
                </div>

                <div className="space-y-5">
                  {manualVsMagic.map((row, index) => (
                    <div key={row.magic} className="flex items-start gap-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-sm font-black text-cyan-300">
                        {index + 1}
                      </div>
                      <p className="text-lg leading-8 text-slate-200">{row.magic}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="insurance" className="bg-white px-6 py-20 text-slate-900">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-base font-medium text-indigo-600">היתרון למשרד הביטוח</div>

            <h2 className="text-3xl font-semibold leading-tight md:text-5xl">
              לא רק WhatsApp ויומן.
              <br />
              גם המערכות המקצועיות שלכם.
            </h2>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 md:text-xl">
              MagicTouch יכולה לשלב באותו תהליך גם חיבורים ל-Surense,
              Roeto, Polywiz, MagicSale ומערכות נוספות.
            </p>

            <p className="mt-5 max-w-xl text-lg font-medium leading-8 text-indigo-950">
              כך תהליך שמתחיל בתקשורת עם הלקוח יכול להמשיך
              לפגישה, ייפוי כוח, מסמכים, קבלת מידעים והמשך טיפול —
              בלי להתחיל כל שלב מחדש באופן ידני.
            </p>
          </div>

          <div className="relative mx-auto h-[420px] w-full max-w-[520px]">
            <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[8px] border-white bg-indigo-600 text-3xl font-semibold text-white shadow-2xl">
              M
            </div>

            <IntegrationNode title="Surense" className="left-1/2 top-4 -translate-x-1/2" />
            <IntegrationNode title="WhatsApp" className="right-2 top-1/3" />
            <IntegrationNode title="Roeto" className="left-2 top-1/3" />
            <IntegrationNode title="Polywiz" className="left-8 bottom-8" />
            <IntegrationNode title="יומנים" className="right-8 bottom-8" />
            <IntegrationNode title="MagicSale" className="left-1/2 bottom-0 -translate-x-1/2" />
          </div>
        </div>
      </section>

      <section className="bg-[#0b1230] px-6 py-20 text-white">
        <div className="mx-auto max-w-6xl text-center">
          <div className="mb-3 text-base font-medium text-cyan-300">ומה כשצריך אדם?</div>

          <h2 className="text-3xl font-semibold leading-tight md:text-5xl">
            MagicTouch לא אמורה להחליף את העובד.
            <br />
            היא אמורה לחסוך לו את מה שלא צריך לעשות ידנית.
          </h2>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">
            כשהתהליך יכול להמשיך לבד — הוא ממשיך.
            כשצריך החלטה, שיחה או טיפול אנושי —
            MagicTouch עוצרת בשלב הנכון ומעבירה את הטיפול לעובד.
          </p>
        </div>
      </section>

      <section id="magic-family" className="bg-white px-6 py-20 text-slate-900">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-semibold md:text-5xl">MagicSale + MagicTouch</h2>
            <p className="mt-4 text-lg text-slate-600">שתי סביבות עבודה. פלטפורמה אחת.</p>
          </div>

          <div className="grid gap-7 md:grid-cols-2">
            <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-8">
              <div className="mb-3 text-base font-medium text-indigo-600">MagicSale</div>
              <h3 className="text-2xl font-semibold text-indigo-950">מנהלת את המידע העסקי.</h3>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                לקוחות, עסקאות, עמלות, דוחות, יעדים,
                ביצועים והמידע העסקי של המשרד.
              </p>
            </div>

            <div className="rounded-3xl bg-[#0b1230] p-8 text-white">
              <div className="mb-3 text-base font-medium text-cyan-300">MagicTouch</div>
              <h3 className="text-2xl font-semibold">מנהלת את התהליך.</h3>
              <p className="mt-5 text-lg leading-8 text-slate-300">
                התקשורת עם הלקוח, הפעולה הבאה, מה כבר בוצע,
                למה מחכים ומתי צריך להעביר את הטיפול לעובד.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="contact"
        className="relative overflow-hidden bg-gradient-to-l from-indigo-900 via-[#161053] to-purple-800 px-6 py-20 text-center text-white"
      >
        <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-300/10 blur-[100px]" />

        <div className="relative z-10 mx-auto max-w-4xl">
          <h2 className="text-4xl font-semibold leading-tight md:text-6xl">
            יש אצלכם תהליך
            <br />
            שחוזר שוב ושוב?
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-indigo-100 md:text-xl">
            נראה יחד אילו שלבים אפשר להפוך לאוטומטיים,
            אילו מערכות אפשר לחבר
            ואיפה עדיין נכון להשאיר את העובד בתהליך.
          </p>

          <button
            onClick={() => router.push('/landing#contact')}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-8 py-4 text-lg font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            בואו נדבר
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>
      </section>

      <footer className="bg-[#050817] px-6 py-8 text-center text-base text-slate-400">
        <div className="mx-auto max-w-4xl">
          <p className="font-semibold text-slate-300">
            MagicTouch מבית Unamix Technological Solutions
          </p>

          <p className="mt-2 text-sm text-slate-500">
            פתרונות תוכנה, אוטומציה ו-AI לעולמות הביטוח והפיננסים.
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-5">
            <a
              href="https://www.unamix.co.il/"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-white"
            >
              אתר Unamix
            </a>
          <Link
  href="/MagicTouchTerms"
  className="transition hover:text-white"
>
  תנאי שימוש
</Link>

<Link
  href="/MagicTouchPrivacy"
  className="transition hover:text-white"
>
  מדיניות פרטיות
</Link>
          </div>

          <p className="mt-4 text-xs text-slate-600">
            © {new Date().getFullYear()} Unamix. כל הזכויות שמורות.
          </p>
        </div>
      </footer>
    </div>
  );
}

function HeroFlowStep({
  icon: Icon,
  title,
  text,
  success = false,
  waiting = false,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
  success?: boolean;
  waiting?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border p-4 ${
        success
          ? 'border-emerald-400/20 bg-emerald-400/10'
          : waiting
          ? 'border-amber-300/20 bg-amber-300/10'
          : 'border-white/10 bg-slate-900/60'
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          success
            ? 'bg-emerald-400 text-slate-950'
            : waiting
            ? 'bg-amber-300 text-slate-950'
            : 'bg-indigo-600 text-white'
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div>
        <div className="text-base font-semibold text-white">{title}</div>
        <div className="mt-1 text-sm leading-6 text-slate-300">{text}</div>
      </div>
    </div>
  );
}

function HeroConnector() {
  return (
    <div className="mr-[21px] flex h-6 items-center">
      <div className="h-full w-px bg-cyan-300/30" />
    </div>
  );
}

function IntegrationNode({
  title,
  className,
}: {
  title: string;
  className: string;
}) {
  return (
    <>
      <div
        className={`absolute z-10 rounded-xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold shadow-lg ${className}`}
      >
        {title}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[70%] -translate-x-1/2 -translate-y-1/2 bg-indigo-100" />
    </>
  );
}
