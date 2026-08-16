'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

import {
  ArrowLeft,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  FileText,
  MessageCircle,
  RefreshCw,
  Sparkles,
  UserRound,
  Workflow,
  Zap,
} from 'lucide-react';

// ============================================================
// DATA
// ============================================================

const integrations = [
  'Surense',
  'Roeto',
  'Polywiz',
  'WhatsApp',
  'יומנים',
  'MagicSale',
];

const dailyPainPoints = [
  'לקוח כתב — צריך לענות.',
  'הלקוח מעוניין — צריך לשלוח קישור.',
  'נקבעה פגישה — צריך לעדכן.',
  'צריך ייפוי כוח, מסמכים או חתימות.',
  'צריך לבדוק מה התקבל ולעדכן מערכות.',
  'צריך לזכור מה עוד צריך לעשות.',
];

const mainFlow = [
  {
    number: '1',
    icon: MessageCircle,
    title: 'לקוח פונה',
    text: 'הודעה נכנסת ב-WhatsApp',
  },
  {
    number: '2',
    icon: CalendarDays,
    title: 'נקבעת פגישה',
    text: 'האירוע מתקבל מהיומן',
  },
  {
    number: '3',
    icon: Zap,
    title: 'MagicTouch מזהה',
    text: 'מה קרה ומה צריך לעשות',
  },
  {
    number: '4',
    icon: Workflow,
    title: 'התהליך מתקדם',
    text: 'הפעולה הבאה מופעלת',
  },
  {
    number: '5',
    icon: CheckCircle2,
    title: 'השלב הושלם',
    text: 'וממשיכים עד סוף התהליך',
  },
];

const insuranceProcess = [
  {
    icon: MessageCircle,
    title: 'פניית הלקוח',
    text: 'הודעה, תגובה או פנייה חדשה',
  },
  {
    icon: CalendarDays,
    title: 'קביעת פגישה',
    text: 'האירוע נכנס מהיומן',
  },
  {
    icon: FileText,
    title: 'פעולה מקצועית',
    text: 'למשל ייפוי כוח או בקשת מידע',
  },
  {
    icon: FileText,
    title: 'בקשת מסמכים',
    text: 'הלקוח מקבל את הבקשה',
  },
  {
    icon: CheckCircle2,
    title: 'קליטת המסמכים',
    text: 'המערכת ממשיכה את התהליך',
  },
  {
    icon: RefreshCw,
    title: 'עדכון מערכות',
    text: 'Surense, Roeto, Polywiz ועוד',
  },
  {
    icon: CheckCircle2,
    title: 'המשך טיפול',
    text: 'השלב הבא מופעל אוטומטית',
  },
];

const workModes = [
  {
    icon: Bot,
    title: 'המערכת מבצעת',
    text: 'שליחת הודעה, עדכון נתונים, הפעלת ממשק או מעבר לשלב הבא.',
  },
  {
    icon: UserRound,
    title: 'מחכה לעובד',
    text: 'צריך החלטה או פעולה אנושית? התהליך נשאר פתוח בשלב הנכון.',
  },
  {
    icon: MessageCircle,
    title: 'מחכה ללקוח',
    text: 'תגובה, מסמך, חתימה או פעולה שהלקוח צריך לבצע.',
  },
  {
    icon: RefreshCw,
    title: 'מחכה למערכת',
    text: 'כשהאירוע מתקבל מהיומן או ממערכת מקצועית — ממשיכים.',
  },
];

// ============================================================
// PAGE
// ============================================================

export default function MagicTouchLandingPage() {
  const router = useRouter();

  const scrollToHowItWorks = () => {
    document
      .getElementById('how-it-works')
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToContact = () => {
    document
      .getElementById('contact')
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen overflow-hidden bg-white text-right"
    >
      {/* ========================================================
          HERO
      ======================================================== */}

      <section className="relative overflow-hidden bg-[#050817] text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-[#050817] via-[#0b1230] to-[#211449]" />

        <div className="absolute -right-32 top-24 h-[500px] w-[500px] rounded-full bg-purple-500/15 blur-[130px]" />

        <div className="absolute -left-20 bottom-0 h-[420px] w-[420px] rounded-full bg-cyan-400/10 blur-[130px]" />

        <div className="relative z-10 mx-auto max-w-7xl px-6 pb-8 pt-5 md:px-10">
          {/* HEADER */}

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
                <div className="text-base font-black">
                  MagicTouch
                </div>

                <div className="text-sm text-cyan-200/70">
                  Smart Process Automation
                </div>
              </div>
            </div>

            <div className="hidden items-center gap-5 text-sm font-bold text-slate-300 lg:flex">
              <a href="#insurance" className="transition hover:text-white">
                Surense
              </a>

              <a href="#insurance" className="transition hover:text-white">
                Roeto
              </a>

              <a href="#insurance" className="transition hover:text-white">
                Polywiz
              </a>

              <a href="#how-it-works" className="transition hover:text-white">
                WhatsApp
              </a>

              <a href="#how-it-works" className="transition hover:text-white">
                יומנים
              </a>

              <a href="#magic-family" className="transition hover:text-white">
                MagicSale
              </a>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/auth/log-in"
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10"
              >
                כניסה למערכת
              </Link>

              <button
                onClick={scrollToContact}
                className="hidden rounded-xl bg-cyan-400 px-5 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-300 sm:block"
              >
                דברו איתנו
              </button>
            </div>
          </motion.header>

          {/* HERO CONTENT */}

          <div className="grid min-h-[650px] items-center gap-12 py-14 lg:grid-cols-[1fr_0.9fr]">
            <motion.div
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="mb-5 text-base font-black text-cyan-300 md:text-lg">
                הרבה מעבר לשליחת WhatsApp
              </div>

              <h1 className="max-w-3xl text-4xl font-black leading-[1.15] sm:text-5xl lg:text-6xl">
                MagicTouch מחברת
                <br />
                את תהליך העבודה
                <br />
                <span className="text-white">
                  של משרד הביטוח.
                </span>
              </h1>

              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
                MagicTouch מחברת בין הלקוחות, WhatsApp, היומן
                והמערכות המקצועיות של המשרד — ומקדמת את הטיפול
                משלב לשלב.
              </p>

              <p className="mt-5 max-w-2xl text-lg font-bold leading-8 text-cyan-200">
                במקום שהעובד יעבור ידנית בין המערכות —
                MagicTouch מנהלת את המעבר ביניהן.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={scrollToContact}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-7 py-3.5 font-black text-slate-950 transition hover:bg-cyan-300"
                >
                  דברו איתנו
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <button
                  onClick={scrollToHowItWorks}
                  className="rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 font-bold text-white transition hover:bg-white/10"
                >
                  איך זה עובד?
                </button>
              </div>
            </motion.div>

            {/* PHONE MOCKUP */}

            <motion.div
              className="relative mx-auto w-full max-w-[380px]"
              initial={{ opacity: 0, scale: 0.94, rotate: 1 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.9, delay: 0.2 }}
            >
              <div className="absolute inset-0 rounded-[60px] bg-cyan-400/10 blur-3xl" />

              <div className="relative rotate-[4deg] rounded-[48px] border-[5px] border-slate-600 bg-[#090d1f] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
                <div className="rounded-[38px] border border-white/10 bg-gradient-to-b from-[#0e1734] to-[#080c1c] px-5 pb-6 pt-5">
                  <div className="mb-6 text-center">
                    <div className="text-lg font-black">
                      MagicTouch
                    </div>

                    <div className="mx-auto mt-4 flex h-16 w-16 items-center justify-center rounded-full border border-purple-400/30 bg-purple-500/10 text-3xl font-black text-purple-300">
                      M
                    </div>
                  </div>

                  <PhoneFlowRow
                    icon={MessageCircle}
                    title="לקוח פנה"
                    subtitle="הודעת WhatsApp נכנסה"
                  />

                  <PhoneArrow />

                  <PhoneFlowRow
                    icon={CalendarDays}
                    title="נקבעה פגישה"
                    subtitle="האירוע התקבל מהיומן"
                  />

                  <PhoneArrow />

                  <PhoneFlowRow
                    icon={FileText}
                    title="נשלח קישור / מסמך"
                    subtitle="ללקוח"
                  />

                  <PhoneArrow />

                  <PhoneFlowRow
                    icon={CheckCircle2}
                    title="המשך בתהליך"
                    subtitle="השלב הבא מופעל"
                    success
                  />
                </div>
              </div>
            </motion.div>
          </div>

          {/* INTEGRATION STRIP */}

          <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-3 lg:grid-cols-6">
            {integrations.map((item) => (
              <div
                key={item}
                className="flex min-h-14 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-base font-black text-slate-200"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================
          DAILY PAIN
      ======================================================== */}

      <section className="bg-white px-6 py-20 text-slate-900">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-base font-black text-indigo-600">
              נשמע מוכר?
            </div>

            <h2 className="text-3xl font-black leading-tight md:text-5xl">
              מה קורה
              <br />
              במשרד שלך כל יום?
            </h2>

            <div className="mt-7 space-y-3">
              {dailyPainPoints.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 text-base leading-7 text-slate-700 md:text-lg"
                >
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-indigo-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-600 text-white">
                  <Clock3 className="h-6 w-6" />
                </div>

                <p className="text-lg font-bold leading-8 text-slate-800">
                  זו נראית כמו רשימה של פעולות קטנות,
                  אבל ביחד הן גוזלות זמן ויוצרות טעויות ועיכובים.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                  <Workflow className="h-6 w-6" />
                </div>

                <p className="text-lg font-black leading-8 text-indigo-950">
                  MagicTouch לוקחת את העבודה הזו מהידיים שלכם —
                  ומקדמת את התהליך משלב לשלב, בדיוק כמו שהגדרתם.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          HOW IT WORKS
      ======================================================== */}

      <section
        id="how-it-works"
        className="bg-[#0b1230] px-6 py-20 text-white"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 text-center">
            <div className="mb-3 text-base font-black text-cyan-300">
              מהפנייה ועד השלב הבא
            </div>

            <h2 className="text-3xl font-black md:text-5xl">
              איך MagicTouch עובדת?
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-5">
            {mainFlow.map((step, index) => {
              const Icon = step.icon;

              return (
                <div
                  key={step.number}
                  className="relative text-center"
                >
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-white/[0.06]">
                    <Icon className="h-8 w-8 text-cyan-300" />
                  </div>

                  <div className="mx-auto -mt-[92px] mb-[70px] flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-black">
                    {step.number}
                  </div>

                  <h3 className="text-lg font-black">
                    {step.title}
                  </h3>

                  <p className="mx-auto mt-2 max-w-[190px] text-base leading-7 text-slate-300">
                    {step.text}
                  </p>

                  {index < mainFlow.length - 1 && (
                    <ArrowLeft className="absolute -left-5 top-10 hidden h-5 w-5 text-slate-500 md:block" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mx-auto mt-12 max-w-5xl rounded-2xl border border-white/10 bg-white/[0.05] px-6 py-5 text-center">
            <p className="text-lg font-bold leading-8 text-slate-200">
              אתם מגדירים את דרך העבודה של המשרד —
              MagicTouch דואגת שהתהליך יתקדם בכל פעם שמשהו קורה.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================
          CONNECTED SYSTEMS
      ======================================================== */}

      <section
        id="insurance"
        className="bg-slate-50 px-6 py-20 text-slate-900"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-base font-black text-indigo-600">
              החיבור שעושה את ההבדל
            </div>

            <h2 className="text-3xl font-black leading-tight md:text-5xl">
              מחברים את המערכות
              <br />
              שאתם כבר עובדים איתן
            </h2>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 md:text-xl">
              WhatsApp, היומן, Surense, Roeto, Polywiz ו-MagicSale
              לא צריכים להיות איים נפרדים.
            </p>

            <p className="mt-4 max-w-xl text-lg font-bold leading-8 text-indigo-950">
              MagicTouch מחברת את האירועים והפעולות ביניהם
              לתהליך אחד שממשיך להתקדם.
            </p>
          </div>

          <div className="relative mx-auto h-[420px] w-full max-w-[520px]">
            <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[8px] border-white bg-indigo-600 text-3xl font-black text-white shadow-2xl">
              M
            </div>

            <IntegrationNode
              title="Surense"
              className="left-1/2 top-4 -translate-x-1/2"
            />

            <IntegrationNode
              title="WhatsApp"
              className="right-2 top-1/3"
            />

            <IntegrationNode
              title="Roeto"
              className="left-2 top-1/3"
            />

            <IntegrationNode
              title="Polywiz"
              className="left-8 bottom-8"
            />

            <IntegrationNode
              title="יומנים"
              className="right-8 bottom-8"
            />

            <IntegrationNode
              title="MagicSale"
              className="left-1/2 bottom-0 -translate-x-1/2"
            />
          </div>
        </div>
      </section>

      {/* ========================================================
          INSURANCE EXAMPLE
      ======================================================== */}

      <section className="bg-white px-6 py-20 text-slate-900">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 text-center">
            <div className="mb-3 text-base font-black text-indigo-600">
              דוגמה אמיתית
            </div>

            <h2 className="text-3xl font-black md:text-5xl">
              כך יכול להיראות תהליך במשרד ביטוח
            </h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-7">
            {insuranceProcess.map((step, index) => {
              const Icon = step.icon;

              return (
                <div
                  key={step.title}
                  className="relative"
                >
                  <div className="h-full rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                      <Icon className="h-6 w-6" />
                    </div>

                    <h3 className="text-base font-black">
                      {step.title}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {step.text}
                    </p>
                  </div>

                  {index < insuranceProcess.length - 1 && (
                    <ArrowLeft className="absolute -left-4 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-indigo-300 lg:block" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================
          AUTOMATION + PEOPLE
      ======================================================== */}

      <section className="bg-[#0b1230] px-6 py-20 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 text-center">
            <div className="mb-3 text-base font-black text-cyan-300">
              לא הכול צריך לקרות אוטומטית
            </div>

            <h2 className="text-3xl font-black leading-tight md:text-5xl">
              יש דברים שהמערכת עושה לבד.
              <br />
              ויש דברים שמחכים לכם.
            </h2>

            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">
              MagicTouch מקדמת את מה שאפשר —
              ועוצרת בדיוק במקום שבו צריך פעולה של עובד,
              תגובה מהלקוח או עדכון ממערכת אחרת.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {workModes.map((mode) => {
              const Icon = mode.icon;

              return (
                <div
                  key={mode.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] p-6"
                >
                  <Icon className="mb-5 h-8 w-8 text-cyan-300" />

                  <h3 className="text-xl font-black">
                    {mode.title}
                  </h3>

                  <p className="mt-3 text-base leading-7 text-slate-300">
                    {mode.text}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mx-auto mt-10 max-w-4xl rounded-2xl border border-white/10 bg-white/[0.05] px-6 py-5 text-center">
            <p className="text-lg font-bold leading-8 text-slate-200">
              כך כל טיפול נשאר בתהליך אחד מסודר —
              גם כשהאחריות עוברת בין המערכת, העובד והלקוח.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================
          MAGIC FAMILY
      ======================================================== */}

      <section
        id="magic-family"
        className="bg-white px-6 py-20 text-slate-900"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-black md:text-5xl">
              MagicSale + MagicTouch
            </h2>

            <p className="mt-4 text-lg text-slate-600">
              שתי סביבות עבודה. פלטפורמה אחת.
            </p>
          </div>

          <div className="grid gap-7 md:grid-cols-2">
            <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-8">
              <div className="mb-3 text-base font-black text-indigo-600">
                MagicSale
              </div>

              <h3 className="text-2xl font-black text-indigo-950">
                מנהלת את העסק.
              </h3>

              <p className="mt-5 text-lg leading-8 text-slate-600">
                לקוחות, עסקאות, עמלות, דוחות, יעדים,
                ביצועים והמידע העסקי של המשרד.
              </p>
            </div>

            <div className="rounded-3xl bg-[#0b1230] p-8 text-white">
              <div className="mb-3 text-base font-black text-cyan-300">
                MagicTouch
              </div>

              <h3 className="text-2xl font-black">
                מקדמת את העבודה.
              </h3>

              <p className="mt-5 text-lg leading-8 text-slate-300">
                שיחות, פגישות, תהליכים, מסמכים,
                אינטגרציות והשלב הבא בטיפול.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          CTA
      ======================================================== */}

      <section
        id="contact"
        className="relative overflow-hidden bg-gradient-to-l from-indigo-900 via-[#161053] to-purple-800 px-6 py-20 text-center text-white"
      >
        <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-300/10 blur-[100px]" />

        <div className="relative z-10 mx-auto max-w-4xl">
          <h2 className="text-4xl font-black leading-tight md:text-6xl">
            פחות לרדוף.
            <br />
            <span className="text-cyan-300">
              יותר להתקדם.
            </span>
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-indigo-100 md:text-xl">
            בואו נראה איך MagicTouch יכולה לחבר את תהליכי העבודה
            והמערכות שכבר קיימות במשרד שלכם.
          </p>

          <button
            onClick={() => router.push('/landing#contact')}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-8 py-4 text-lg font-black text-slate-950 transition hover:bg-cyan-300"
          >
            דברו איתנו
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>
      </section>

      {/* ========================================================
          FOOTER
      ======================================================== */}

      <footer className="bg-[#050817] px-6 py-7 text-center text-base text-slate-400">
        <p>
          © {new Date().getFullYear()} MagicSale by Unamix.
          כל הזכויות שמורות.
        </p>

        <div className="mt-3 flex justify-center gap-5">
          <Link
            href="/terms"
            className="transition hover:text-white"
          >
            תנאי שימוש
          </Link>

          <Link
            href="/privacy"
            className="transition hover:text-white"
          >
            מדיניות פרטיות
          </Link>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// COMPONENTS
// ============================================================

function PhoneFlowRow({
  icon: Icon,
  title,
  subtitle,
  success = false,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  success?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          success
            ? 'bg-emerald-500 text-white'
            : 'bg-indigo-600 text-white'
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div>
        <div className="text-sm font-black text-white">
          {title}
        </div>

        <div className="mt-0.5 text-sm text-slate-300">
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function PhoneArrow() {
  return (
    <div className="flex h-7 items-center justify-center text-cyan-300">
      ↓
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
        className={`absolute z-10 rounded-xl border border-slate-200 bg-white px-5 py-3 text-base font-black shadow-lg ${className}`}
      >
        {title}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[70%] -translate-x-1/2 -translate-y-1/2 bg-indigo-100" />
    </>
  );
}