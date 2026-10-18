'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Sparkles,
  LayoutDashboard,
  Users,
  ShieldCheck,
  BarChart3,
  TrendingUp,
  FileSearch,
  Scale,
  KeyRound,
  DownloadCloud,
  Lightbulb,
  Target,
  Calculator,
  Webhook,
  Split,
  FileText,
  GitCompare,
  type LucideIcon,
} from 'lucide-react';
import { ContactSection } from '@/components/FeatureCard';
import {
  proFeatures,
  basicFeatures,
  enterpriseFeatures,
  isSoonFeature,
} from '@/components/FeatureCard/planContent';

// חברות שהטעינה האוטומטית פעילה עבורן בייצור (אינפיניטי עדיין לא)
const supportedCompanies = [
  'כלל',
  'מגדל',
  'הפניקס',
  'מנורה',
  'הראל',
  'איילון',
  'מור',
  'מיטב',
  'אנליסט',
  'אלטשולר שחם',
  'הכשרה',
  'ילין לפידות',
];

const heroBullets = [
  { text: 'עמלות נפרעים – טעינה אוטומטית מכל חברות הביטוח ובתי ההשקעות', soon: false },
  { text: 'עמלות היקף – בקרוב', soon: true },
  { text: 'ניתוח תיק ברמת לקוח, פוליסה, חברה וחודש', soon: false },
  { text: 'השוואה בין חודשים – מה נוסף, מה ירד ומה השתנה', soon: false },
  { text: 'סקירת AI, מגמות וסיכומים', soon: false },
];

const steps = [
  {
    icon: KeyRound,
    title: 'מחברים את הפורטלים',
    text: 'מגדירים פעם אחת את פרטי הכניסה לפורטלים של החברות.',
  },
  {
    icon: DownloadCloud,
    title: 'הדוחות נטענים אוטומטית',
    text: 'המערכת מושכת את דוחות העמלות מכל החברות ומאחדת אותם למקום אחד.',
  },
  {
    icon: Lightbulb,
    title: 'מקבלים ניתוח ותובנות',
    text: 'רואים מה קורה בתיק – ברמת לקוח, פוליסה, חברה וחודש – כולל סקירת AI.',
  },
];

// image: null = צילום מסך חדש שעוד לא הוכן (מוצג פאנל חלופי). שם הקובץ המתוכנן מופיע בהערה.
const coreFeatures: {
  id: string;
  title: string;
  description: string;
  extraText: string;
  image: string | null;
  icon: LucideIcon;
}[] = [
  {
    id: 'auto-import-dashboard',
    title: 'טעינה אוטומטית של דוחות עמלות',
    description:
      'בלי להיכנס לפורטלים ובלי להוריד קבצים – דוחות העמלות נמשכים אוטומטית מחברות הביטוח ומבתי ההשקעות.',
    extraText:
      'דשבורד מרכזי מציג את סטטוס ההרצות, ההצלחות, השגיאות והטעינות שבוצעו — כך שתמיד תדעו מה הושלם, מה בטיפול ומה דורש תשומת לב.',
    image: '/static/img/landingImg/auto-dashboard.png',
    icon: DownloadCloud,
  },
  {
    id: 'portfolio-analysis',
    title: 'ניתוח תיק והבנה אמיתית של ההכנסות',
    description: 'תמונה מלאה של התיק לפי מוצרים, חברות וחודשים — במקום אחד.',
    extraText:
      'התפלגות לפי מוצרים וחברות, השוואה בין תקופות, והבנה מדויקת של מאיפה מגיעות ההכנסות ואיפה נמצאות ההזדמנויות.',
    image: '/static/img/landingImg/portfolio-analysis.png',
    icon: BarChart3,
  },
  {
    id: 'customer-policy',
    title: 'רמת לקוח ופוליסה',
    description: 'יורדים לפרטים: כמה כל לקוח וכל פוליסה מכניסים, בכל חברה ובכל חודש.',
    extraText:
      'מזהים לקוחות שהעמלה שלהם ירדה או נעלמה, פוליסות חדשות שנכנסו, ומה השתנה מחודש לחודש.',
    image: null, // customer-policy.png
    icon: FileSearch,
  },
  {
    id: 'month-comparison',
    title: 'השוואה בין חודשים',
    description: 'בוחרים שני חודשים ורואים בדיוק מה נוסף, מה ירד ומה השתנה.',
    extraText:
      'פוליסות חדשות, פוליסות שנעלמו ועמלות שהשתנו – ברמת פוליסה, עם סינון לפי חברה וסוכן וייצוא לאקסל.',
    image: null, // month-comparison.png
    icon: GitCompare,
  },
  {
    id: 'trends',
    title: 'מגמות וסיכומים',
    description: 'מעקב אחר התפתחות התיק לאורך זמן – לפי חברה, מוצר וחודש.',
    extraText:
      'סיכומים חודשיים ושנתיים, גרפי מגמה והשוואות שעוזרים להבין לאן התיק הולך.',
    image: null, // trends.png
    icon: TrendingUp,
  },
  {
    id: 'ai-insights',
    title: 'סקירת AI ותובנות',
    description: 'סקירה חכמה של התיק שמסכמת מה חשוב לדעת עכשיו.',
    extraText:
      'יעילות תיק, פוטנציאל לניודים, נקודות שדורשות טיפול ורשימת עבודה – בלי לחפור בטבלאות.',
    image: null, // ai-insights.png
    icon: Sparkles,
  },
  {
    id: 'agreements-check',
    title: 'בדיקת עמלות מול ההסכמים',
    description: 'השוואה בין מה ששולם בפועל לבין ההסכמים שהוגדרו לכם במערכת.',
    extraText:
      'ניהול הסכמי עמלות לפי ברירת מחדל, מוצר וחברה – ושליטה מלאה במה שאמור להתקבל.',
    image: '/static/img/landingImg/commissions.png',
    icon: Scale,
  },
];

const salesModules: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: LayoutDashboard, title: 'ניהול עסקאות', text: 'הזנה, עדכון ומעקב אחר עסקאות' },
  { icon: Users, title: 'לקוחות ומשפחות', text: 'כל הלקוחות וקשרי המשפחה במקום אחד' },
  { icon: Webhook, title: 'לידים מ-API', text: 'קבלת לידים ממערכות וממשקים חיצוניים' },
  { icon: ShieldCheck, title: 'עובדים והרשאות', text: 'מי רואה מה ומי מבצע מה' },
  { icon: Target, title: 'יעדים וביצועים', text: 'יעדים אישיים וקבוצתיים ומעקב ביצועים' },
  { icon: Split, title: 'פיצול עמלות', text: 'שיתופי פעולה בין סוכנים, עובדים ומקורות לידים' },
  { icon: Calculator, title: 'סימולטור', text: 'חישוב רווחים צפויים' },
  { icon: FileText, title: 'דוחות', text: 'דוחות לפי חודשים, עובדים, מוצרים וחברות' },
];

const faqs = [
  {
    question: 'מאילו חברות נטענים הדוחות?',
    answer: `כיום הטעינה האוטומטית פעילה מול: ${supportedCompanies.join(', ')}. חברות נוספות מתווספות כל הזמן.`,
  },
  {
    question: 'אילו דוחות נטענים?',
    answer:
      'כרגע נטענים דוחות עמלות נפרעים. טעינת עמלות היקף נמצאת בפיתוח ותתווסף בקרוב.',
  },
  {
    question: 'האם פרטי ההתחברות לפורטלים מאובטחים?',
    answer:
      'כן. פרטי ההתחברות נשמרים מוצפנים, והגישה לנתונים מוגבלת לפי הרשאות – כל משתמש רואה רק את מה שמותר לו.',
  },
  {
    question: 'איפה נשמר המידע שלי ושל הלקוחות שלי?',
    answer:
      'המידע נשמר בתשתית Google Cloud, בהפרדה מלאה בין סוכנים, בהתאם לתקנות הגנת הפרטיות. כל סוכן רואה רק את הנתונים שלו (או של קבוצת הסוכנים שהוגדרה לו), והמידע אינו משמש לאימון מודלים של בינה מלאכותית.',
  },
  {
    question: 'מה ההבדל בין המנוי המקצועי למנוי הבסיסי?',
    answer:
      'המנוי המקצועי כולל את הטעינה האוטומטית של דוחות העמלות, ניתוח התיק, סקירת ה-AI והבדיקה מול ההסכמים – וגם את כל מודולי ניהול המכירות. המנוי הבסיסי מיועד למי שצריך רק ניהול מכירות, בלי טעינה וניתוח.',
  },
  {
    question: 'האם יש הרשאות לעובדים?',
    answer:
      'בהחלט. ניתן להגדיר הרשאות לפי תפקיד, כך שכל עובד יראה רק את המסכים והפעולות הרלוונטיים עבורו.',
  },
  {
    question: 'האם יש תקופת ניסיון?',
    answer:
      'כן. תוכלו להתנסות במערכת במשך 14 יום, ואם תחליטו לבטל בתקופה זו — תקבלו החזר מלא.',
  },
];

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function ScreenshotPlaceholder({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="w-full max-w-[700px] aspect-[7/4] rounded-xl shadow-lg bg-gradient-to-br from-indigo-100 via-blue-50 to-violet-100 border border-indigo-100 flex flex-col items-center justify-center gap-3 text-indigo-800">
      <Icon className="w-16 h-16 opacity-70" />
      <span className="text-lg font-bold opacity-80">{title}</span>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash === '#contact') {
        const el = document.getElementById('contact');
        if (el) {
          setTimeout(() => {
            el.scrollIntoView({ behavior: 'smooth' });
          }, 300);
        }
      }
    }
  }, [pathname, searchParams]);

  return (
    <div className="relative bg-gray-50 text-right">
      <motion.div
        className="absolute top-4 w-full px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-start sm:items-center z-50"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex justify-start w-full sm:w-auto">
          <Image
            src="/static/img/landingImg/union-5.png"
            alt="MagicSale Logo"
            width={150}
            height={40}
            className="w-28 sm:w-40 h-auto"
          />
        </div>

        <div className="mt-2 sm:mt-0 flex gap-2 sm:gap-4 justify-end w-full sm:w-auto">
          <Link
            href="/auth/log-in"
            className="inline-flex items-center justify-center rounded-full border border-white px-4 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-white hover:text-indigo-900 transition"
          >
            כניסה למערכת
          </Link>

          <Link
            href="/subscription-sign-up"
            className="inline-flex items-center justify-center rounded-full border border-white px-4 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-white hover:text-indigo-900 transition"
          >
            הרשמה
          </Link>
        </div>
      </motion.div>

      {/* ─── Hero: טעינה אוטומטית של דוחות עמלות ─── */}
      <section className="relative min-h-[80vh] pt-28 md:pt-36 pb-12 flex flex-col justify-center items-center bg-gradient-to-br from-indigo-900 to-blue-800 text-white text-center overflow-hidden">
        <motion.h1
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold mb-5 z-10 relative leading-tight max-w-5xl px-4"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
        >
          כל דוחות העמלות שלכם –{' '}
          <span className="text-green-400">במקום אחד, אוטומטית</span>
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl mb-6 z-10 relative max-w-3xl px-6 leading-relaxed text-indigo-100"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
        >
          בלי להיכנס לפורטלים ובלי להוריד קבצים. MagicSale מושכת את הדוחות, מאחדת אותם
          ומראה לכם בדיוק מה קורה בתיק.
        </motion.p>

        <motion.ul
          className="z-10 relative mb-8 px-6 grid sm:grid-cols-2 gap-x-8 gap-y-2 text-right max-w-3xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5 }}
        >
          {heroBullets.map((b) => (
            <li key={b.text} className="flex items-start gap-2 text-base md:text-lg">
              <span className={b.soon ? 'text-yellow-300' : 'text-green-400'}>
                {b.soon ? '⏳' : '✔'}
              </span>
              <span className={b.soon ? 'text-indigo-200' : ''}>{b.text}</span>
            </li>
          ))}
        </motion.ul>

        <motion.div
          className="flex flex-col sm:flex-row gap-3 z-10 relative"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
        >
          <button
            onClick={() => router.push('/subscription-sign-up')}
            className="bg-green-400 text-indigo-950 font-bold px-8 py-3 rounded-full shadow-xl hover:bg-green-300 transition"
          >
            התחילו עכשיו
          </button>

          <button
            onClick={() => scrollToId('video')}
            className="border border-white text-white font-bold px-8 py-3 rounded-full hover:bg-white hover:text-indigo-900 transition"
          >
            ▶ צפו בסרטון
          </button>
        </motion.div>

        <motion.div
          className="absolute top-0 left-0 w-full h-full z-0"
          animate={{ opacity: [0.1, 0.2, 0.1] }}
          transition={{ repeat: Infinity, duration: 5 }}
        >
          <Sparkles className="absolute w-full h-full opacity-10" />
        </motion.div>

        <nav className="mt-10 flex justify-center flex-wrap gap-6 text-sm text-white z-10 relative px-4">
          <a href="#how-it-works" className="hover:underline">איך זה עובד</a>
          <a href="#core-features" className="hover:underline">מה מקבלים</a>
          <a href="#pricing" className="hover:underline">מחירים</a>
          <a href="#sales-modules" className="hover:underline">ניהול מכירות</a>
          <a href="#faq" className="hover:underline">שאלות נפוצות</a>
        </nav>
      </section>

      {/* ─── חברות נתמכות ─── */}
      <section className="bg-white py-8 px-4 border-b border-gray-200">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-blue-900 font-bold mb-4">
            טעינה אוטומטית מכל חברות הביטוח ובתי ההשקעות
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {supportedCompanies.map((c) => (
              <span
                key={c}
                className="px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-sm text-blue-900"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-blue-100 text-blue-900 text-center py-5 px-4 border-b border-blue-300">
        <p className="text-lg font-semibold">
          ⭐ נסו את MagicSale בראש שקט – החזר מלא אם תבטלו בתוך 14 יום ⭐
        </p>
      </section>

      {/* ─── איך זה עובד ─── */}
      <section id="how-it-works" className="bg-white py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-blue-800 text-center mb-10">איך זה עובד</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {steps.map((s, idx) => (
              <motion.div
                key={s.title}
                className="bg-blue-50 rounded-2xl p-6 border border-blue-100 shadow-sm text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.15 }}
              >
                <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold">
                  {idx + 1}
                </div>
                <s.icon className="w-8 h-8 mx-auto mb-2 text-indigo-700" />
                <h3 className="text-blue-900 font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-gray-700 leading-relaxed">{s.text}</p>
              </motion.div>
            ))}
          </div>

          {/* סרטון ההדגמה – אותו קישור שנשלח בוואטסאפ (מפנה לקובץ ב-Storage) */}
          <div id="video" className="mt-12 max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-blue-800 text-center mb-4">
              צפו איך זה עובד
            </h3>
            <video
              src="/commissions-video"
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-xl shadow-lg bg-black"
            />
          </div>
        </div>
      </section>

      {/* ─── מה מקבלים מהטעינה ─── */}
      <section id="core-features" className="overflow-y-visible py-20 px-6">
        <h2 className="text-3xl font-bold text-blue-800 text-center mb-4">
          מה מקבלים מהטעינה האוטומטית
        </h2>
        <p className="text-center text-gray-600 max-w-3xl mx-auto mb-16 leading-relaxed">
          הדוחות הם רק ההתחלה – המערכת הופכת אותם לתמונה ברורה של התיק וההכנסות.
        </p>

        <div className="space-y-28">
          {coreFeatures.map((feature, index) => (
            <motion.div
              id={feature.id}
              key={feature.id}
              className={`max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-12 ${
                index % 2 !== 0 ? 'md:flex-row-reverse' : ''
              }`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              {feature.image ? (
                <Image
                  src={feature.image}
                  alt={feature.title}
                  width={700}
                  height={400}
                  className="rounded-xl shadow-lg w-full max-w-[700px] object-contain"
                />
              ) : (
                <ScreenshotPlaceholder icon={feature.icon} title={feature.title} />
              )}

              <div className="text-right max-w-md">
                <div className="flex items-center gap-2 mb-3 text-green-500">
                  <feature.icon className="w-6 h-6" />
                  <h3 className="text-2xl font-bold text-indigo-900">{feature.title}</h3>
                </div>
                <p className="text-gray-700 text-md leading-relaxed mb-2">{feature.description}</p>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.extraText}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── מחירים: PRO במרכז ─── */}
      <section id="pricing" className="py-20 bg-white text-right">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-blue-800 mb-4 text-center">
            מנוי אחד – כל דוחות העמלות וכל הניתוחים
          </h2>
          <p className="text-center text-gray-600 max-w-3xl mx-auto mb-12 leading-relaxed">
            המנוי המקצועי כולל את הטעינה האוטומטית, ניתוח התיק, סקירת ה-AI – וגם את כל מודולי
            ניהול המכירות.
          </p>

          <div className="grid gap-8 md:grid-cols-[1fr_1.5fr_1fr] items-center">
            {/* בסיסי – כרטיס קטן */}
            <div className="order-2 md:order-none rounded-2xl p-6 bg-gray-50 border border-gray-200 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold mb-1 text-gray-800">מנוי בסיסי – ניהול מכירות</h3>
                <p className="text-sm text-gray-600 mb-1">₪89 לחודש + מע&quot;מ</p>
                <p className="text-xs text-gray-500 mb-4">
                  לסוכן אחד, ללא טעינת דוחות עמלות וניתוח תיק
                </p>
                <ul className="text-gray-600 space-y-1.5 text-sm leading-relaxed mb-5">
                  {basicFeatures.map((f) => (
                    <li key={f}>✔ {f}</li>
                  ))}
                </ul>
              </div>
              <Link
                href="/subscription-sign-up"
                className="border border-gray-400 text-gray-700 hover:bg-gray-100 font-bold py-2 px-4 rounded-full w-full text-center text-sm"
              >
                להרשמה למנוי בסיסי
              </Link>
            </div>

            {/* PRO – במרכז */}
            <div className="order-1 md:order-none relative rounded-2xl p-8 md:p-10 bg-white border-2 border-indigo-600 shadow-2xl flex flex-col justify-between">
              <div className="absolute -top-3 right-1/2 translate-x-1/2 bg-yellow-400 text-indigo-950 text-xs font-bold px-3 py-1 rounded-full shadow">
                הכי פופולרי ⭐
              </div>
              <div>
                <h3 className="text-2xl font-extrabold mb-1 text-indigo-900">מנוי מקצועי</h3>
                <p className="text-sm text-indigo-700 font-semibold mb-3">
                  טעינה אוטומטית + ניתוח תיק + ניהול מכירות
                </p>
                <p className="text-3xl font-extrabold text-indigo-900 mb-1">
                  ₪285 <span className="text-base font-medium text-gray-600">לחודש + מע&quot;מ</span>
                </p>
                <p className="text-xs text-gray-500 mb-6">
                  לסוכן + עובד, ניתן להוסיף עובדים נוספים בתשלום · כולל עד 2,000 לקוחות פעילים
                </p>
                <ul className="text-gray-800 space-y-2.5 text-base leading-relaxed mb-8">
                  {proFeatures.map((f, idx) => (
                    <li
                      key={f}
                      className={idx === 0 ? 'font-bold text-indigo-900' : isSoonFeature(f) ? 'text-gray-500' : ''}
                    >
                      {isSoonFeature(f) ? '⏳' : '✔'} {f}
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                href="/subscription-sign-up"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-full w-full text-center text-lg"
              >
                התחילו עכשיו
              </Link>
            </div>

            {/* בתי סוכן – פתרון נפרד עם הקמה */}
            <div className="order-3 md:order-none rounded-2xl p-6 bg-purple-50 border border-purple-200 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold mb-1 text-purple-900">בתי סוכן וסוכנויות</h3>
                <p className="text-sm text-gray-600 mb-1">בהתאמה אישית</p>
                <p className="text-xs text-gray-500 mb-4">פתרון נפרד הכולל הקמה</p>
                <ul className="text-gray-600 space-y-1.5 text-sm leading-relaxed mb-5">
                  {enterpriseFeatures.map((f) => (
                    <li key={f}>✔ {f}</li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => scrollToId('contact')}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-full w-full text-sm"
              >
                דברו איתנו
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── משני: מודולי ניהול מכירות ─── */}
      <section id="sales-modules" className="py-16 px-4 bg-gray-100">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-blue-800 text-center mb-3">
            ובנוסף – מודולים לניהול המכירות
          </h2>
          <p className="text-center text-gray-600 mb-10">כלולים במנוי המקצועי</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {salesModules.map((m) => (
              <div key={m.title} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                <m.icon className="w-6 h-6 text-indigo-600 mb-2" />
                <h3 className="font-bold text-blue-900 text-sm mb-1">{m.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="bg-white py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-blue-800 text-center mb-10">שאלות נפוצות</h2>
          <div className="space-y-6">
            {faqs.map((faq, idx) => (
              <motion.div
                key={idx}
                className="bg-gray-100 rounded-xl p-6 shadow-md"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
              >
                <h4 className="font-semibold text-lg text-blue-900 mb-2">{faq.question}</h4>
                <p className="text-gray-700 leading-relaxed">{faq.answer}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="text-center py-24 bg-gradient-to-br from-blue-800 to-indigo-900 text-white px-4">
        <h2 className="text-4xl font-extrabold mb-4">די להוריד דוחות מהפורטלים</h2>
        <p className="text-lg mb-6 max-w-3xl mx-auto leading-relaxed">
          דוחות העמלות נטענים אוטומטית, ואתם מקבלים ניתוח מלא של התיק – ברמת לקוח, פוליסה, חברה
          וחודש, כולל סקירת AI.
        </p>
        <button
          onClick={() => router.push('/subscription-sign-up')}
          className="bg-white text-indigo-900 font-bold px-8 py-3 rounded-full shadow hover:shadow-lg hover:bg-indigo-100 transition"
        >
          התחילו עכשיו
        </button>
      </section>

      <ContactSection />

      <footer className="bg-gray-100 text-center py-6 text-sm text-gray-600">
        <p>© {new Date().getFullYear()} MagicSale. כל הזכויות שמורות.</p>
        <div className="flex justify-center gap-4 mt-2 text-blue-600">
          <Link href="/terms">תנאי שימוש</Link>
          <Link href="/privacy">מדיניות פרטיות</Link>
        </div>
      </footer>
    </div>
  );
}
