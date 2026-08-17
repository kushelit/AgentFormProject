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

const concreteActions = [
  {
    icon: MessageCircle,
    title: 'מקבלת פניות ותגובות מ-WhatsApp',
    text: 'לקוח שולח הודעה, מגיב לתבנית או בוחר תשובה — והמערכת יכולה להפעיל את התהליך המתאים.',
  },
  {
    icon: CalendarDays,
    title: 'יודעת מתי נקבעה או בוטלה פגישה',
    text: 'חיבור ליומן מאפשר ל-MagicTouch להמשיך אוטומטית לפי מה שקרה בפגישה.',
  },
  {
    icon: FileText,
    title: 'שולחת קישורים, הודעות ובקשות מסמכים',
    text: 'במקום שהעובד יזכור מה לשלוח ומתי — הפעולות יכולות לצאת מתוך התהליך.',
  },
  {
    icon: Workflow,
    title: 'מפעילה פעולות במערכות מקצועיות',
    text: 'למשל יצירת פעולה ב-Surense, המשך טיפול מול Polywiz או עדכון מערכת תפעולית.',
  },
  {
    icon: RefreshCw,
    title: 'עוקבת אחרי מה שכבר קרה',
    text: 'המערכת שומרת את מצב התהליך ויודעת מה הושלם ומה עדיין ממתין.',
  },
  {
    icon: UserRound,
    title: 'מעבירה לעובד רק את מה שבאמת צריך אותו',
    text: 'אם נדרשת החלטה או פעולה אנושית — התהליך ממתין לעובד בדיוק במקום הנכון.',
  },
];

const mainFlow = [
  {
    number: '1',
    icon: MessageCircle,
    title: 'הלקוח פונה',
    text: 'הודעה או תגובה נכנסת ב-WhatsApp',
  },
  {
    number: '2',
    icon: CalendarDays,
    title: 'הלקוח קובע פגישה',
    text: 'MagicTouch מזהה שהאירוע נוצר ביומן',
  },
  {
    number: '3',
    icon: FileText,
    title: 'נשלח מה שצריך',
    text: 'ייפוי כוח, קישור, מסמך או הודעה',
  },
  {
    number: '4',
    icon: Workflow,
    title: 'המערכות מתעדכנות',
    text: 'הפעולה ממשיכה במערכת המקצועית הרלוונטית',
  },
  {
    number: '5',
    icon: CheckCircle2,
    title: 'התהליך ממשיך',
    text: 'עד שנדרש העובד או עד שהטיפול הושלם',
  },
];

const insuranceProcess = [
  {
    icon: MessageCircle,
    title: 'לקוח כתב ב-WhatsApp',
    text: 'המערכת מזהה את הפנייה',
  },
  {
    icon: CalendarDays,
    title: 'נשלח קישור לפגישה',
    text: 'והלקוח קובע מועד',
  },
  {
    icon: FileText,
    title: 'נוצר ייפוי כוח',
    text: 'בהתאם לתהליך שהוגדר',
  },
  {
    icon: MessageCircle,
    title: 'הלקוח מקבל הודעה',
    text: 'עם הקישור וההנחיות',
  },
  {
    icon: FileText,
    title: 'נשלחת בקשת מסמכים',
    text: 'למשל תעודת זהות',
  },
  {
    icon: RefreshCw,
    title: 'המערכת ממתינה',
    text: 'ללקוח, לחתימה או למערכת אחרת',
  },
  {
    icon: UserRound,
    title: 'העובד נכנס כשצריך',
    text: 'וממשיך מהשלב הנכון',
  },
];

const workModes = [
  {
    icon: Bot,
    title: 'המערכת עושה לבד',
    text: 'שליחת הודעה, עדכון נתונים, הפעלת ממשק או מעבר לשלב הבא.',
  },
  {
    icon: UserRound,
    title: 'מחכה לעובד',
    text: 'נדרשת החלטה או פעולה אנושית? התהליך נשאר פתוח בשלב הנכון.',
  },
  {
    icon: MessageCircle,
    title: 'מחכה ללקוח',
    text: 'תגובה, מסמך, חתימה או פעולה אחרת שהלקוח צריך לבצע.',
  },
  {
    icon: RefreshCw,
    title: 'מחכה למערכת',
    text: 'כשהאירוע מתקבל מהיומן או ממערכת מקצועית — התהליך ממשיך.',
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
                <div className="text-base font-black">MagicTouch</div>
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

          <div className="grid min-h-[650px] items-center gap-12 py-14 lg:grid-cols-[1fr_0.9fr]">
            <motion.div
              initial={{ opacity: 0, x: 25 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="mb-5 text-base font-black text-cyan-300 md:text-lg">
                מערכת שמקדמת את הטיפול בלקוח
              </div>

              <h1 className="max-w-3xl text-4xl font-black leading-[1.15] sm:text-5xl lg:text-6xl">
                הלקוח פנה?
                <br />
                MagicTouch יכולה
                <br />
                <span className="text-cyan-300">
                  להמשיך את הטיפול לבד.
                </span>
              </h1>

              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
                לקוח שולח WhatsApp, קובע פגישה, צריך ייפוי כוח,
                מסמכים או טיפול במערכת מקצועית?
                MagicTouch מזהה מה קרה, מפעילה את הפעולה הבאה
                ומקדמת את התהליך.
              </p>

              <p className="mt-5 max-w-2xl text-lg font-bold leading-8 text-cyan-200">
                העובד נכנס רק במקום שבו באמת נדרשת פעולה אנושית.
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
                  מה המערכת עושה בפועל?
                </button>
              </div>
            </motion.div>

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
                    <div className="text-lg font-black">MagicTouch</div>

                    <div className="mx-auto mt-4 flex h-16 w-16 items-center justify-center rounded-full border border-purple-400/30 bg-purple-500/10 text-3xl font-black text-purple-300">
                      M
                    </div>
                  </div>

                  <PhoneFlowRow
                    icon={MessageCircle}
                    title="לקוח פנה"
                    subtitle="התקבלה הודעת WhatsApp"
                  />

                  <PhoneArrow />

                  <PhoneFlowRow
                    icon={CalendarDays}
                    title="נשלח קישור לפגישה"
                    subtitle="הלקוח קבע מועד"
                  />

                  <PhoneArrow />

                  <PhoneFlowRow
                    icon={FileText}
                    title="נשלח ייפוי כוח"
                    subtitle="והתבקשה תעודת זהות"
                  />

                  <PhoneArrow />

                  <PhoneFlowRow
                    icon={CheckCircle2}
                    title="התהליך ממשיך"
                    subtitle="עד שנדרשת פעולה מהעובד"
                    success
                  />
                </div>
              </div>
            </motion.div>
          </div>

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
          WHAT DOES IT ACTUALLY DO
      ======================================================== */}

      <section
        id="how-it-works"
        className="bg-white px-6 py-20 text-slate-900"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <div className="mb-3 text-base font-black text-indigo-600">
              בלי סיסמאות
            </div>

            <h2 className="text-3xl font-black leading-tight md:text-5xl">
              אז מה MagicTouch
              <br />
              עושה בפועל?
            </h2>

            <p className="mt-6 text-lg leading-8 text-slate-600 md:text-xl">
              בכל פעם שמשהו קורה עם הלקוח או באחת המערכות,
              MagicTouch יכולה להחליט מה הפעולה הבאה ולהפעיל אותה.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {concreteActions.map((item, index) => {
              const Icon = item.icon;

              return (
                <motion.div
                  key={item.title}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-7 shadow-sm"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: index * 0.06 }}
                >
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                    <Icon className="h-6 w-6" />
                  </div>

                  <h3 className="text-xl font-black leading-7">
                    {item.title}
                  </h3>

                  <p className="mt-3 text-base leading-7 text-slate-600">
                    {item.text}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================
          MANUAL VS MAGICTOUCH
      ======================================================== */}

      <section className="bg-slate-50 px-6 py-20 text-slate-900">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-14 max-w-4xl text-center">
            <div className="mb-3 text-base font-black text-indigo-600">
              מה משתנה ביום העבודה?
            </div>

            <h2 className="text-3xl font-black leading-tight md:text-5xl">
              היום כמעט כל שלב
              <br />
              דורש פעולה ידנית.
              <br />

              <span className="text-indigo-600">
                עם MagicTouch — התהליך יכול להתקדם לבד.
              </span>
            </h2>

            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-600 md:text-xl">
              מהתכתבות עם הלקוח כדי למצוא מועד לפגישה,
              דרך שליחת ייפוי כוח ובדיקת חתימה,
              ועד בדיקה אם המידעים כבר התקבלו —
              העובד צריך לזכור, להיכנס, לבדוק ולבצע שוב ושוב את הפעולה הבאה.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm md:p-10">
              <div className="mb-7 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                  <Clock3 className="h-6 w-6 text-slate-600" />
                </div>

                <div>
                  <div className="text-sm font-bold text-slate-500">היום</div>

                  <h3 className="text-2xl font-black">
                    הרבה פעולות. כולן ידניות.
                  </h3>
                </div>
              </div>

              <div className="space-y-5">
                <ManualStep
                  number="1"
                  title="הלקוח פונה ב-WhatsApp"
                  text="העובד מתחיל להתכתב איתו."
                />

                <ManualStep
                  number="2"
                  title="מנסים למצוא מועד לפגישה"
                  text="הודעות הלוך ושוב עד שמוצאים שעה שמתאימה."
                />

                <ManualStep
                  number="3"
                  title="אחרי שנקבעה פגישה"
                  text="העובד נכנס למערכת כדי לשלוח ייפוי כוח או בקשה למידעים."
                />

                <ManualStep
                  number="4"
                  title="אחר כך צריך לבדוק אם הלקוח חתם"
                  text="להיכנס שוב ולבדוק את הסטטוס."
                />

                <ManualStep
                  number="5"
                  title="צריך לבדוק אם המידעים כבר הגיעו"
                  text="ואם לא — לזכור לבדוק שוב מאוחר יותר."
                />

                <ManualStep
                  number="6"
                  title="כשהכול מתקבל"
                  text="העובד ממשיך ידנית לשלב הבא בטיפול."
                />
              </div>

              <div className="mt-8 rounded-2xl bg-slate-100 px-5 py-4">
                <p className="text-base font-bold leading-7 text-slate-700">
                  אף פעולה בפני עצמה לא מורכבת.
                  הבעיה היא שצריך לזכור ולבצע את כולן —
                  עבור כל לקוח מחדש.
                </p>
              </div>
            </div>

            <div className="rounded-[32px] bg-[#0b1230] p-8 text-white shadow-xl md:p-10">
              <div className="mb-7 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400 text-slate-950">
                  <Zap className="h-6 w-6" />
                </div>

                <div>
                  <div className="text-sm font-bold text-cyan-300">
                    עם MagicTouch
                  </div>

                  <h3 className="text-2xl font-black">
                    אותו טיפול. תהליך שמתקדם.
                  </h3>
                </div>
              </div>

              <div className="space-y-0">
                <MagicFlowStep
                  icon={MessageCircle}
                  title="הלקוח פנה"
                  text="MagicTouch מזהה את הפנייה."
                />

                <FlowConnector />

                <MagicFlowStep
                  icon={CalendarDays}
                  title="נשלח קישור אוטומטי לקביעת פגישה"
                  text="הלקוח בוחר בעצמו את המועד שמתאים לו."
                />

                <FlowConnector />

                <MagicFlowStep
                  icon={CheckCircle2}
                  title="הפגישה נקבעה"
                  text="MagicTouch מקבלת את האירוע ישירות מהיומן."
                />

                <FlowConnector />

                <MagicFlowStep
                  icon={FileText}
                  title="נשלחת אוטומטית בקשה לייפוי כוח / מידעים"
                  text="בהתאם לתהליך שהוגדר למשרד."
                />

                <FlowConnector />

                <MagicFlowStep
                  icon={RefreshCw}
                  title="MagicTouch ממתינה"
                  text="לחתימה, למידעים או לאירוע הבא."
                  waiting
                />

                <FlowConnector />

                <MagicFlowStep
                  icon={CheckCircle2}
                  title="המידעים התקבלו"
                  text="התהליך יודע שאפשר להתקדם."
                  success
                />

                <FlowConnector />

                <MagicFlowStep
                  icon={UserRound}
                  title="ממשיכים לשלב הבא"
                  text="אוטומטית — או לעובד, אם עכשיו באמת צריך אותו."
                  success
                />
              </div>

              <div className="mt-8 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-4">
                <p className="text-base font-black leading-7 text-cyan-100 md:text-lg">
                  MagicTouch לא רק מזכירה מה צריך לעשות —
                  היא יכולה לבצע את הפעולה, להמתין לתוצאה
                  ולהמשיך כשהאירוע הבא מתקבל.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================
          FLOW
      ======================================================== */}

      <section className="bg-[#0b1230] px-6 py-20 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 text-center">
            <div className="mb-3 text-base font-black text-cyan-300">
              דוגמה פשוטה
            </div>

            <h2 className="text-3xl font-black md:text-5xl">
              כך טיפול אחד יכול להתקדם
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-5">
            {mainFlow.map((step, index) => {
              const Icon = step.icon;

              return (
                <div key={step.number} className="relative text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-white/[0.06]">
                    <Icon className="h-8 w-8 text-cyan-300" />
                  </div>

                  <div className="mx-auto -mt-[92px] mb-[70px] flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-black">
                    {step.number}
                  </div>

                  <h3 className="text-lg font-black">{step.title}</h3>

                  <p className="mx-auto mt-2 max-w-[195px] text-base leading-7 text-slate-300">
                    {step.text}
                  </p>

                  {index < mainFlow.length - 1 && (
                    <ArrowLeft className="absolute -left-5 top-10 hidden h-5 w-5 text-slate-500 md:block" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================
          INSURANCE SYSTEMS
      ======================================================== */}

      <section
        id="insurance"
        className="bg-white px-6 py-20 text-slate-900"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-base font-black text-indigo-600">
              כאן נמצא היתרון למשרד הביטוח
            </div>

            <h2 className="text-3xl font-black leading-tight md:text-5xl">
              לא רק WhatsApp.
              <br />
              גם המערכות המקצועיות
              <br />
              של המשרד.
            </h2>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 md:text-xl">
              MagicTouch יכולה לחבר תהליכים גם ל-Surense,
              Roeto, Polywiz, MagicSale ולמערכות נוספות
              בהתאם לצורת העבודה של המשרד.
            </p>

            <p className="mt-5 max-w-xl text-lg font-bold leading-8 text-indigo-950">
              כך פעולה שהתחילה ב-WhatsApp לא נעצרת שם —
              היא יכולה להמשיך לפגישה, מסמכים ופעולות מקצועיות.
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
          REAL INSURANCE EXAMPLE
      ======================================================== */}

      <section className="bg-slate-50 px-6 py-20 text-slate-900">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 text-center">
            <div className="mb-3 text-base font-black text-indigo-600">
              דוגמה ממשרד ביטוח
            </div>

            <h2 className="text-3xl font-black md:text-5xl">
              לקוח קבע פגישה. מה קורה עכשיו?
            </h2>

            <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-600">
              במקום שהעובד יתחיל עכשיו שרשרת של פעולות ידניות,
              MagicTouch יכולה לבצע חלק גדול מהן מתוך אותו תהליך.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-7">
            {insuranceProcess.map((step, index) => {
              const Icon = step.icon;

              return (
                <div key={step.title} className="relative">
                  <div className="h-full rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                      <Icon className="h-6 w-6" />
                    </div>

                    <h3 className="text-base font-black">{step.title}</h3>

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
          WAITING STATES
      ======================================================== */}

      <section className="bg-[#0b1230] px-6 py-20 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 text-center">
            <div className="mb-3 text-base font-black text-cyan-300">
              גם כשאי אפשר להמשיך מיד
            </div>

            <h2 className="text-3xl font-black leading-tight md:text-5xl">
              MagicTouch יודעת
              <br />
              למה התהליך מחכה.
            </h2>

            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">
              לא כל שלב ניתן לבצע אוטומטית.
              אבל גם שלב שממתין לא צריך ללכת לאיבוד.
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

                  <h3 className="text-xl font-black">{mode.title}</h3>

                  <p className="mt-3 text-base leading-7 text-slate-300">
                    {mode.text}
                  </p>
                </div>
              );
            })}
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
                מנהלת את המידע העסקי.
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
                מנהלת את הטיפול.
              </h3>

              <p className="mt-5 text-lg leading-8 text-slate-300">
                מה קרה עם הלקוח, מה צריך לבצע עכשיו,
                מה כבר נעשה ומה עדיין ממתין.
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
            יש תהליך שחוזר
            <br />
            שוב ושוב במשרד?
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-indigo-100 md:text-xl">
            נראה יחד מה אפשר להעביר ל-MagicTouch,
            אילו מערכות אפשר לחבר ואיפה עדיין נכון להשאיר את העובד בתהליך.
          </p>

          <button
            onClick={() => router.push('/landing#contact')}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-8 py-4 text-lg font-black text-slate-950 transition hover:bg-cyan-300"
          >
            בואו נדבר
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
          <Link href="/terms" className="transition hover:text-white">
            תנאי שימוש
          </Link>

          <Link href="/privacy" className="transition hover:text-white">
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

function ManualStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-600">
        {number}
      </div>

      <div>
        <div className="text-lg font-black text-slate-900">
          {title}
        </div>

        <div className="mt-1 text-base leading-7 text-slate-600">
          {text}
        </div>
      </div>
    </div>
  );
}

function MagicFlowStep({
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
      className={`
        flex
        items-center
        gap-4
        rounded-2xl
        border
        p-4

        ${
          success
            ? 'border-emerald-400/20 bg-emerald-400/10'
            : waiting
            ? 'border-amber-300/20 bg-amber-300/10'
            : 'border-white/10 bg-white/[0.05]'
        }
      `}
    >
      <div
        className={`
          flex
          h-11
          w-11
          shrink-0
          items-center
          justify-center
          rounded-xl

          ${
            success
              ? 'bg-emerald-400 text-slate-950'
              : waiting
              ? 'bg-amber-300 text-slate-950'
              : 'bg-indigo-600 text-white'
          }
        `}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div>
        <div className="text-base font-black text-white md:text-lg">
          {title}
        </div>

        <div className="mt-1 text-sm leading-6 text-slate-300 md:text-base">
          {text}
        </div>
      </div>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="mr-[21px] flex h-7 items-center">
      <div className="h-full w-px bg-cyan-300/30" />
    </div>
  );
}
