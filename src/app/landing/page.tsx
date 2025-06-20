'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, LayoutDashboard, Users, ShieldCheck, BarChart3 } from 'lucide-react';
import { GraphsSection } from '@/components/FeatureCard';


const features = [
  {
    id: 'deals',
    title: 'ניהול עסקאות',
    description: 'הזנה, עדכון ומחיקה של עסקאות בצורה חכמה ונוחה.',
    extraText: 'כל המידע העסקי שלך מרוכז במקום אחד – נגיש, מהיר ומעודכן.',
    image: '/static/img/landingImg/deals.png',
    icon: LayoutDashboard
  },
  {
    id: 'customers',
    title: 'ניהול לקוחות',
    description: 'רשימת לקוחות עם הוספה, עדכון ותא משפחתי.',
    extraText: 'שליטה מלאה בכל פרט – לקוח פרטי או משפחה שלמה.',
    image: '/static/img/landingImg/customers.png',
    icon: Users
  },
  {
    id: 'family',
    title: 'קשרים משפחתיים',
    description: 'תצוגה משפחתית מרוכזת לדוחות וניהול חכם.',
    extraText: 'תמונה שלמה על כל תא משפחתי – קל לדווח, להבין ולנתח.',
    image: '/static/img/landingImg/family.png',
    icon: Users
  },
  {
    id: 'commissions',
    title: 'ניהול עמלות',
    description: 'שליטה על עמלות ברירת מחדל או לפי מוצר וחברה.',
    extraText: 'חשב עמלות בצורה אוטומטית וחכמה – בלי הפתעות.',
    image: '/static/img/landingImg/commissions.png',
    icon: BarChart3
  },
  {
    id: 'permissions',
    title: 'ניהול הרשאות',
    description: 'שליטה מלאה בהרשאות לסוכן ולעובדים.',
    extraText: 'בחר מי רואה מה – אבטחה וניהול גמיש לפי תפקיד.',
    image: '/static/img/landingImg/permissions.png',
    icon: ShieldCheck
  },
  {
    id: 'goals',
    title: 'יעדים',
    description: 'מעקב יעדים, ביצועים וסטטיסטיקות עסקיות.',
    extraText: 'תמונה חיה של ההתקדמות – עם גרפים ברורים ועדכניים.',
    image: '/static/img/landingImg/goals.png',
    icon: BarChart3
  }
];

const faqs = [
  {
    question: 'האם אפשר לייבא נתונים מקובץ אקסל?',
    answer: 'כן! ניתן להעלות קובץ אקסל עם עסקאות או לקוחות, והמערכת תזהה ותמיר את המידע בצורה חכמה.'
  },
  {
    question: 'האם יש הרשאות לעובדים?',
    answer: 'בהחלט. ניתן לשלוט בכל עובד אילו דפים הוא רואה ומה מותר לו לעשות.'
  },
  {
    question: 'האם קיימת גרסה עתידית לנייד?',
    answer: 'כרגע המערכת מותאמת לדסקטופ בלבד, אך גרסה מותאמת לנייד נמצאת בתכנון.'
  }
];





export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="relative bg-gray-50 text-right">
      <motion.div
        className="absolute top-4 right-6 z-50"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Image src="/static/img/landingImg/union-5.png" alt="MagicSale Logo" width={140} height={40} />
      </motion.div>
      <section className="relative min-h-[70vh] flex flex-col justify-center items-center bg-gradient-to-br from-indigo-900 to-blue-800 text-white text-center overflow-hidden">
        <motion.h1 
          className="text-5xl md:text-6xl font-extrabold mb-4 z-10 relative leading-tight"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9 }}
        >
          תנו למספרים <span className="text-green-400">לדבר בעד עצמם</span>
        </motion.h1>
        <motion.p 
          className="text-lg md:text-xl mb-6 z-10 relative max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4 }}
        >
          ניהול עסק חכם לסוכני ביטוח: עמלות, לידים, לקוחות, גרפים, יעדים והרשאות – במקום אחד.
        </motion.p>
        <motion.button
          onClick={() => router.push('/subscription-sign-up')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="bg-white text-indigo-900 font-bold px-8 py-3 rounded-full shadow-xl hover:bg-indigo-100 transition z-10 relative"
        >
          התחילו עכשיו
        </motion.button>
        <motion.div 
          className="absolute top-0 left-0 w-full h-full z-0"
          animate={{ opacity: [0.15, 0.3, 0.15] }}
          transition={{ repeat: Infinity, duration: 5 }}
        >
          <Sparkles className="absolute w-full h-full opacity-10" />
        </motion.div>

        <nav className="mt-6 flex justify-center flex-wrap gap-6 text-sm text-white z-10 relative">
          {features.map(f => (
            <a href={`#${f.id}`} key={f.id} className="hover:underline">{f.title}</a>
          ))}
          <a href="#faq" className="hover:underline">שאלות נפוצות</a>
        </nav>
      </section>
      <section className="py-16 bg-blue-50 text-right">
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.7 }}
    className="max-w-6xl mx-auto bg-white shadow-xl rounded-2xl px-8 py-10 border border-blue-200 flex flex-col md:flex-row items-center gap-8"
  >
    {/* Text section */}
    <div className="flex-1">
      <h2 className="text-2xl font-bold text-blue-800 mb-4">
        עדיין עובדים עם אקסל?
      </h2>
      <p className="text-base text-gray-700 leading-relaxed">
        הגיע הזמן לשדרג ✨ תוך דקות תייבאו את כל הנתונים שלכם למערכת ותתחילו לראות תובנות, עמלות ורווחיות בזמן אמת.
      </p>
    </div>

    {/* Tilted image section */}
    <div className="flex-1">
      <Image
        src="/static/img/landingImg/import.png"
        alt="ייבוא אקסל למערכת"
        width={500}
        height={350}
        className="rounded-xl shadow-md transform rotate-3" // הטיה קלה
      />
    </div>
  </motion.div>
</section>
      <section className="overflow-y-visible py-20 px-6 space-y-32">
        {features.map((feature, index) => (
          <motion.div
            id={feature.id}
            key={index}
            className={`max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-12 ${index % 2 !== 0 ? 'md:flex-row-reverse' : ''}`}
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
                <h3 className="text-2xl font-bold text-indigo-900">{feature.title}</h3>
              </div>
              <p className="text-gray-700 text-md leading-relaxed mb-2">{feature.description}</p>
              <p className="text-gray-500 text-sm leading-relaxed">{feature.extraText}</p>
            </div>
          </motion.div>
        ))}
      </section>
      <GraphsSection />
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

      <section className="text-center py-24 bg-gradient-to-br from-blue-800 to-indigo-900 text-white">
        <h2 className="text-4xl font-extrabold mb-4">הגיע הזמן לשלוט בעסק</h2>
        <p className="text-lg mb-6">הצטרפו למאות סוכנים שכבר עברו לניהול חכם עם MagicSale</p>
        <button
          onClick={() => router.push('/subscription-sign-up')}
          className="bg-white text-indigo-900 font-bold px-8 py-3 rounded-full shadow hover:shadow-lg hover:bg-indigo-100 transition"
        >
          קבעו הדגמה
        </button>
      </section>
    </div>
  );
}
