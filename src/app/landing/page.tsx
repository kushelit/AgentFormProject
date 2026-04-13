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
} from 'lucide-react';
import { GraphsSection } from '@/components/FeatureCard';
import { ContactSection } from '@/components/FeatureCard';

const features = [
  {
    id: 'auto-import-dashboard',
    title: 'טעינה אוטומטית של דוחות עמלות',
    description:
      'המערכת מאפשרת משיכה אוטומטית של דוחות הנפרעים מחברות הביטוח ומבתי ההשקעות.',
    extraText:
      'דשבורד מרכזי מציג את סטטוס ההרצות, ההצלחות, השגיאות והטעינות שבוצעו — כך שתמיד תדעו מה הושלם, מה בטיפול ומה דורש תשומת לב.',
    image: '/static/img/landingImg/auto-dashboard.png',
    icon: Sparkles,
  },
  {
    id: 'portfolio-analysis',
    title: 'ניתוח תיק והבנה אמיתית של ההכנסות',
    description:
      'תמונה מלאה של התיק לפי מוצרים, חברות וחודשים — במקום אחד.',
    extraText:
      'המערכת מנתחת את התפתחות התיק לאורך זמן, מציגה התפלגות לפי מוצרים וחברות, ועוזרת להבין בדיוק מאיפה מגיעות ההכנסות ואיפה נמצאות הזדמנויות.',
    image: '/static/img/landingImg/portfolio-analysis.png',
    icon: BarChart3,
  },
  {
    id: 'deals',
    title: 'ניהול עסקאות',
    description: 'ניהול חכם, מהיר ומדויק של כל העסקאות במקום אחד.',
    extraText:
      'הזנה, עדכון ומעקב אחר עסקאות בצורה מסודרת, ברורה ונוחה לעבודה יומיומית.',
    image: '/static/img/landingImg/deals.png',
    icon: LayoutDashboard,
  },
  {
    id: 'customers',
    title: 'ניהול לקוחות',
    description: 'כל הלקוחות שלכם מרוכזים במערכת אחת מסודרת וחכמה.',
    extraText:
      'הוספה, עדכון וניהול מלא של לקוחות, כולל תמונה מלאה על כל הפעילות העסקית שלהם.',
    image: '/static/img/landingImg/customers.png',
    icon: Users,
  },
  {
    id: 'family',
    title: 'קשרים משפחתיים',
    description: 'תצוגה משפחתית מרוכזת לניהול, בקרה והבנה טובה יותר של התיק.',
    extraText:
      'המערכת מחברת בין בני משפחה ומציגה תמונה רחבה שמאפשרת עבודה יעילה ונוחה יותר.',
    image: '/static/img/landingImg/family.png',
    icon: Users,
  },
  {
    id: 'commissions',
    title: 'ניהול עמלות והסכמים',
    description: 'ניהול עמלות גמיש לפי ברירת מחדל, מוצר, חברה או הסכם.',
    extraText:
      'שליטה מלאה במבני העמלות וביכולת לחשב, לבדוק ולהבין מה אמור להתקבל בפועל.',
    image: '/static/img/landingImg/commissions.png',
    icon: BarChart3,
  },
  {
    id: 'reports',
    title: 'מודול דוחות מתקדם',
    description: 'הפקת דוחות חכמים לפי חודשים, עובדים, מוצרים וחברות.',
    extraText:
      'ניתוח מגמות, רווחיות, השוואות בין תקופות וייצוא מידע להמשך עבודה וקבלת החלטות.',
    image: '/static/img/landingImg/reports.png',
    icon: BarChart3,
  },
  {
    id: 'commission-split',
    title: 'פיצול עמלות',
    description: 'ניהול שיתופי פעולה בין סוכנים, עובדים ומקורות לידים.',
    extraText:
      'הגדרת אחוזי פיצול בצורה מדויקת, שקופה ואוטומטית, בהתאם להסכמים הקיימים במערכת.',
    image: '/static/img/landingImg/commissionSplit.png',
    icon: BarChart3,
  },
  {
    id: 'permissions',
    title: 'ניהול הרשאות',
    description: 'שליטה מלאה בהרשאות של סוכנים, עובדים ומנהלים.',
    extraText:
      'הגדירו מי רואה מה, מי מבצע מה, והתאימו את המערכת למבנה העבודה שלכם.',
    image: '/static/img/landingImg/permissions.png',
    icon: ShieldCheck,
  },
  {
    id: 'goals',
    title: 'יעדים וביצועים',
    description: 'מעקב יעדים, ניתוח ביצועים ותמונה עסקית עדכנית בכל רגע.',
    extraText:
      'גרפים, נתונים וסטטיסטיקות שיעזרו לכם להבין איפה אתם עומדים ולאן אתם מתקדמים.',
    image: '/static/img/landingImg/goals.png',
    icon: BarChart3,
  },
];

const faqs = [
  {
    question: 'איך מודול טעינת העמלות עוזר לי בפועל?',
    answer:
      'המערכת מאפשרת טעינה אוטומטית של דוחות נפרעים מחברות הביטוח ומבתי ההשקעות. בנוסף, היא מאפשרת לנתח את התפתחות התיק לפי מוצר, חברה וחודש, ולהשוות בין מה ששולם בפועל לבין ההסכמים שהוגדרו לסוכן במערכת.',
  },
  {
    question: 'איך עוברים מאקסל למערכת?',
    answer:
      'ניתן לבצע טעינה ראשונית של נתונים מקובצי אקסל, כך שתוכלו להעביר את המידע שלכם בקלות ולהתחיל לעבוד במערכת בלי להתחיל מאפס.',
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

const pricingPlans = [
  {
    id: 'basic',
    title: 'מנוי בסיסי',
    badgeText: null as string | null,
    badgeColor: '',
    priceText: '₪89 לחודש + מע"מ',
    subtitle: 'מנוי לסוכן אחד בלבד',
    features: [
      'ניהול עסקאות בצורה פשוטה ונוחה',
      'יצירה, עדכון וניהול של לקוחות ומשפחות',
      'צפייה בעמלות חודשיות וסיכומים כלליים',
      'ניהול לידים וקבלת לידים מממשקים חיצוניים',
      'ניהול יעדים',
      'שימוש בסימולטור לחישוב רווחים צפויים',
      'ייבוא נתונים מקובצי אקסל',
      'מעקב גרפי אחר ביצועים',
      'מודול דוחות מתקדם',
    ],
    ctaType: 'link' as const,
    ctaText: 'התחילו עכשיו',
    ctaHref: '/subscription-sign-up',
  },
  {
    id: 'pro',
    title: 'מנוי מקצועי',
    badgeText: 'הכי פופולרי ⭐',
    badgeColor: 'bg-yellow-400',
    priceText: '₪285 לחודש + מע"מ',
    subtitle: 'מנוי לסוכן + עובד, ניתן להוסיף עובדים נוספים בתשלום',
    features: [
      'כל מה שכלול בתוכנית הבסיס, ובנוסף:',
      'ניהול עובדים, כולל שיוך לסוכנים',
      'הקצאת הרשאות לפי תפקידים',
      'ניהול יעדים אישיים וקבוצתיים',
      'אפשרות להוספת עובדים נוספים לפי צורך',
      'טעינה אוטומטית של דוחות עמלות נפרעים',
      'ניתוח התפתחות התיק ברמת מוצר, חברה וחודש',
      'בדיקת עמלות מול ההסכמים המוגדרים במערכת',
      'המחיר כולל עד 2,000 לקוחות פעילים',
    ],
    ctaType: 'link' as const,
    ctaText: 'התחילו עכשיו',
    ctaHref: '/subscription-sign-up',
  },
  {
    id: 'enterprise',
    title: 'מנוי לבתי סוכן',
    badgeText: 'מותאם לארגונים',
    badgeColor: 'bg-purple-600',
    priceText: 'בהתאמה אישית',
    subtitle: 'פתרון מותאם אישית לסוכנויות, בתי סוכן וארגונים',
    features: [
      'כל מה שכלול בתוכנית המקצועית, ובנוסף:',
      'ניהול מתקדם של קבוצות, סוכנויות משנה ועובדים',
      'התאמות מיוחדות לפי צרכי הארגון',
      'תמיכה מורחבת ומנהל לקוח אישי',
      'אינטגרציות מתקדמות למערכות חיצוניות',
      'פתרון מותאם להיקפי פעילות גדולים',
      'להצעת מחיר מותאמת – צרו איתנו קשר',
    ],
    ctaType: 'button' as const,
    ctaText: 'דברו איתנו',
    ctaHref: '/landing#contact',
  },
];

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

      <section className="relative min-h-[74vh] pt-24 md:pt-32 flex flex-col justify-center items-center bg-gradient-to-br from-indigo-900 to-blue-800 text-white text-center overflow-hidden">
       <motion.h1
  className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold mb-4 z-10 relative leading-tight max-w-6xl px-4"
  initial={{ opacity: 0, y: -30 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.9 }}
>
  תנו למספרים <span className="text-green-400">לדבר בעד עצמם</span>
</motion.h1>

<motion.p
  className="text-lg md:text-xl mb-6 z-10 relative max-w-4xl px-6 leading-relaxed"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 1, delay: 0.4 }}
>
  כל מה שסוכן ביטוח צריך – במקום אחד: ניהול עסקאות, לקוחות, טעינת עמלות, לידים, גרפים והרשאות.
  בטלו תוך 14 יום ותקבלו החזר מלא.
</motion.p>
        <motion.div
          className="flex flex-col sm:flex-row gap-3 z-10 relative"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
        >
          <button
            onClick={() => router.push('/subscription-sign-up')}
            className="bg-white text-indigo-900 font-bold px-8 py-3 rounded-full shadow-xl hover:bg-indigo-100 transition"
          >
            התחילו עכשיו
          </button>

          <button
            onClick={() => {
              const el = document.getElementById('pricing');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="border border-white text-white font-bold px-8 py-3 rounded-full hover:bg-white hover:text-indigo-900 transition"
          >
            לצפייה בתוכניות
          </button>
        </motion.div>

        <motion.div
          className="absolute top-0 left-0 w-full h-full z-0"
          animate={{ opacity: [0.1, 0.2, 0.1] }}
          transition={{ repeat: Infinity, duration: 5 }}
        >
          <Sparkles className="absolute w-full h-full opacity-10" />
        </motion.div>

        <nav className="mt-8 flex justify-center flex-wrap gap-6 text-sm text-white z-10 relative px-4">
          <a href="#auto-import-dashboard" className="hover:underline">
            טעינה אוטומטית
          </a>
          <a href="#portfolio-analysis" className="hover:underline">
            ניתוח תיק
          </a>
          <a href="#deals" className="hover:underline">
            ניהול עסקאות
          </a>
          <a href="#customers" className="hover:underline">
            ניהול לקוחות
          </a>
          <a href="#commissions" className="hover:underline">
            ניהול עמלות
          </a>
          <a href="#reports" className="hover:underline">
            דוחות
          </a>
          <a href="#faq" className="hover:underline">
            שאלות נפוצות
          </a>
        </nav>
      </section>

      <section className="bg-blue-100 text-blue-900 text-center py-6 px-4 border-t border-b border-blue-300">
        <p className="text-lg font-semibold">
          ⭐ נסו את MagicSale בראש שקט – החזר מלא אם תבטלו בתוך 14 יום ⭐
        </p>
      </section>

      <section className="bg-white py-8 px-4 border-b border-gray-200">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6 text-center">
          <div className="bg-blue-50 rounded-2xl p-5 shadow-sm border border-blue-100">
            <h3 className="text-blue-900 font-bold mb-2">טעינה אוטומטית</h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              משיכת דוחות נפרעים ישירות מהחברות, בלי עבודה ידנית
            </p>
          </div>

          <div className="bg-blue-50 rounded-2xl p-5 shadow-sm border border-blue-100">
            <h3 className="text-blue-900 font-bold mb-2">ניתוח תיק מתקדם</h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              הבנה מלאה של ההכנסות לפי מוצר, חברה וחודש
            </p>
          </div>

          <div className="bg-blue-50 rounded-2xl p-5 shadow-sm border border-blue-100">
            <h3 className="text-blue-900 font-bold mb-2">בדיקת עמלות</h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              השוואה בין מה ששולם בפועל לבין ההסכמים שלך
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-y-visible py-20 px-6 space-y-32">
        {features.map((feature, index) => (
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
            <Image
              src={feature.image}
              alt={feature.title}
              width={700}
              height={400}
              className={`rounded-xl shadow-lg w-full max-w-[700px] object-contain ${
                feature.id === 'permissions' ? 'max-h-[300px]' : ''
              }`}
            />

            <div className="text-right max-w-md">
              <div className="flex items-center gap-2 mb-3 text-green-400">
                <feature.icon className="w-6 h-6 animate-pulse" />
                <h3 className="text-2xl font-bold text-indigo-900">
                  {feature.title}
                </h3>
              </div>
              <p className="text-gray-700 text-md leading-relaxed mb-2">
                {feature.description}
              </p>
              <p className="text-gray-500 text-sm leading-relaxed">
                {feature.extraText}
              </p>
            </div>
          </motion.div>
        ))}
      </section>

      <GraphsSection />

      <section id="pricing" className="py-20 bg-white text-right">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-blue-800 mb-4 text-center">
            בחרו את התוכנית שמתאימה לכם
          </h2>
          <p className="text-center text-gray-600 max-w-3xl mx-auto mb-12 leading-relaxed">
            בין אם אתם סוכן עצמאי, משרד עם עובדים או בית סוכן — MagicSale בנויה לצמוח יחד איתכם.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {pricingPlans.map((plan) => {
              const isBasic = plan.id === 'basic';
              const isPro = plan.id === 'pro';
              const isEnterprise = plan.id === 'enterprise';

              const cardClasses = [
                'relative rounded-2xl p-8 flex flex-col justify-between min-h-[560px] transition',
                isBasic && 'bg-blue-50 shadow hover:shadow-lg',
                isPro && 'bg-white border-2 border-indigo-600 shadow-lg scale-[1.01]',
                isEnterprise && 'bg-purple-50 border border-purple-300 shadow hover:shadow-lg',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div key={plan.id} className={cardClasses}>
                  {plan.badgeText && (
                    <div
                      className={`absolute top-2 left-2 ${plan.badgeColor} text-white text-xs font-bold px-2 py-1 rounded shadow`}
                    >
                      {plan.badgeText}
                    </div>
                  )}

                  <div>
                    <h3
                      className={`text-xl font-bold mb-2 ${
                        isEnterprise
                          ? 'text-purple-900'
                          : isPro
                          ? 'text-indigo-900'
                          : 'text-blue-900'
                      }`}
                    >
                      {plan.title}
                    </h3>

                    <p className="text-sm text-gray-600 mb-1">{plan.priceText}</p>

                    {plan.subtitle && (
                      <p className="text-xs text-gray-500 mb-4">{plan.subtitle}</p>
                    )}

                    <ul className="text-gray-700 space-y-2 text-sm leading-relaxed mb-6">
                      {plan.features.map((feature, idx) => (
                        <li key={idx}>✔ {feature}</li>
                      ))}
                    </ul>
                  </div>

                  {plan.ctaType === 'link' ? (
                    <Link
                      href={plan.ctaHref}
                      className={
                        isPro
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-full w-full text-center'
                          : 'bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded-full w-full text-center'
                      }
                    >
                      {plan.ctaText}
                    </Link>
                  ) : (
                    <button
                      onClick={() => router.push(plan.ctaHref)}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-full w-full"
                    >
                      {plan.ctaText}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="faq" className="bg-white py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-blue-800 text-center mb-10">
            שאלות נפוצות
          </h2>
          <div className="space-y-6">
            {faqs.map((faq, idx) => (
              <motion.div
                key={idx}
                className="bg-gray-100 rounded-xl p-6 shadow-md"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
              >
                <h4 className="font-semibold text-lg text-blue-900 mb-2">
                  {faq.question}
                </h4>
                <p className="text-gray-700 leading-relaxed">{faq.answer}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="text-center py-24 bg-gradient-to-br from-blue-800 to-indigo-900 text-white px-4">
        <h2 className="text-4xl font-extrabold mb-4">
          הגיע הזמן לשלוט טוב יותר בהכנסות שלכם
        </h2>
        <p className="text-lg mb-6 max-w-3xl mx-auto leading-relaxed">
          עם MagicSale תוכלו לטעון, לנתח, להשוות ולהבין באמת מה קורה בעמלות, בלקוחות ובביצועים —
          ממערכת אחת חכמה שנבנתה במיוחד לעולם סוכני הביטוח.
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