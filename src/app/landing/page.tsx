'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/Button/Button";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="bg-gray-50 min-h-screen text-right">
      <header className="bg-blue-900 text-white py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">MagicSale – מערכת ניהול מתקדמת לסוכני ביטוח</h1>
          <p className="text-xl mb-6">המערכת שהופכת את העבודה שלך ליעילה, חכמה ומדויקת</p>
          <Button
            text="התחלת רישום"
            className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-6 py-3 rounded-xl"
            onClick={() => router.push('/subscription-sign-up')}
          />
        </div>
      </header>

      <section className="py-16 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-semibold text-blue-800 mb-10">מה המערכת כוללת?</h2>
          <ul className="grid gap-6 grid-cols-1 sm:grid-cols-2 text-lg">
            <li className="bg-gray-100 p-6 rounded-xl shadow">🔹 ניהול לקוחות ועסקאות</li>
            <li className="bg-gray-100 p-6 rounded-xl shadow">🔹 התחלה מיידית על ידי יבוא נתונים מקובץ אקסל</li>
            <li className="bg-gray-100 p-6 rounded-xl shadow">🔹 ניהול הסכמי עמלות</li>
            <li className="bg-gray-100 p-6 rounded-xl shadow">🔹 ניהול חישובי עמלות</li>
            <li className="bg-gray-100 p-6 rounded-xl shadow">🔹 גרפים מתקדמים</li>
            <li className="bg-gray-100 p-6 rounded-xl shadow">🔹 ניהול לידים חכם</li>
            <li className="bg-gray-100 p-6 rounded-xl shadow">🔹 אפשרות להוספת עובדים</li>
            <li className="bg-gray-100 p-6 rounded-xl shadow">🔹 מערכת לניהול הרשאות מתקדמת</li>
          </ul>
        </div>
      </section>

      <section id="cta" className="py-16 px-6 bg-blue-50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl text-blue-800 font-bold mb-6">רוצה להצטרף למהפכה הדיגיטלית?</h2>
          <p className="text-lg mb-8">הצטרף עכשיו למאות סוכנים שכבר נהנים ממערכת ניהול חכמה, מהירה ומדויקת – בהתאמה אישית לעסק שלך.</p>
          <Button
            text="התחלת רישום"
            className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-8 py-4 rounded-xl"
            onClick={() => router.push('/subscription-sign-up')}
          />
        </div>
      </section>
    </div>
  );
}
