import { useRouter } from 'next/navigation';
import React from 'react';

interface PlansSectionProps {
  onEnterpriseClick?: () => void;
}

export default function PlansSection({ onEnterpriseClick }: PlansSectionProps) {
  const router = useRouter();

  const handleEnterpriseClick = () => {
    if (onEnterpriseClick) {
      onEnterpriseClick();
    } else {
      router.push('/landing#contact');
    }
  };

  return (
    <section id="pricing" className="py-20 bg-white text-right">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-blue-800 mb-12 text-center">בחרו את התוכנית שמתאימה לכם</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {/* תוכנית BASIC */}
          <div className="relative bg-blue-50 rounded-2xl p-8 shadow hover:shadow-lg transition flex flex-col justify-between min-h-[480px]">
            <h3 className="text-xl font-bold mb-2 text-blue-900">Basic – עד 10 משתמשים</h3>
            <p className="text-sm text-gray-600 mb-4">135 ₪ לחודש / משתמש</p>
            <ul className="text-gray-700 space-y-2 text-sm leading-relaxed mb-6">
              <li>✔ ניהול עסקאות ולקוחות</li>
              <li>✔ מעקב עמלות בסיסי</li>
              <li>✔ סימולציה והפקת דוחות</li>
              <li>✔ ניהול משתמשים והרשאות בסיסיות</li>
            </ul>
            <button className="bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded-full w-full">
              התחילו 14 ימים חינם
            </button>
          </div>

          {/* תוכנית PRO */}
          <div className="relative bg-white border-2 border-indigo-600 rounded-2xl p-8 shadow-lg scale-105 flex flex-col justify-between min-h-[480px]">
            <div className="absolute top-2 left-2 bg-yellow-400 text-white text-xs font-bold px-2 py-1 rounded shadow">
              הכי פופולרי ⭐
            </div>
            <h3 className="text-xl font-bold mb-2 text-indigo-900">Pro – עד 50 משתמשים</h3>
            <p className="text-sm text-gray-600 mb-4">117 ₪ לחודש / משתמש</p>
            <ul className="text-gray-700 space-y-2 text-sm leading-relaxed mb-6">
              <li>✔ כל מה שיש ב־Basic, ובנוסף:</li>
              <li>✔ ניהול עובדים והרשאות מתקדמות</li>
              <li>✔ יעד אישי ובונוסים</li>
              <li>✔ יבוא אקסל ומעקב גרפים</li>
              <li>✔ הוספת עובדים לפי צורך</li>
            </ul>
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-full w-full">
              התחילו 14 ימים חינם
            </button>
          </div>

          {/* תוכנית ENTERPRISE */}
          <div className="relative bg-purple-50 border border-purple-300 rounded-2xl p-8 shadow hover:shadow-lg transition flex flex-col justify-between min-h-[480px]">
            <div className="absolute top-2 left-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded shadow">
              מותאם לארגונים
            </div>
            <h3 className="text-xl font-bold mb-2 text-purple-900">Enterprise – מעל 50 משתמשים</h3>
            <p className="text-sm text-gray-600 mb-4">בהתאמה אישית</p>
            <ul className="text-gray-700 space-y-2 text-sm leading-relaxed mb-6">
              <li>✔ כל האפשרויות של Pro</li>
              <li>✔ ניהול קבוצות וסוכנויות</li>
              <li>✔ התאמות לארגונים גדולים</li>
              <li>✔ חיבורים למערכות קיימות</li>
              <li>✔ תמיכה טכנית מורחבת</li>
            </ul>
            <button
              onClick={handleEnterpriseClick}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-full w-full"
            >
              דברו איתנו
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
