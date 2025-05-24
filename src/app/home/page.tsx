'use client';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center text-center p-10">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-bold text-blue-800 mb-4">ברוכים הבאים ל־MagicSale</h1>
        <p className="text-lg text-gray-700">
          מערכת ניהול חכמה וחדשנית עבור סוכני ביטוח – לניהול עסקאות, לקוחות, לידים, עובדים ועמלות במקום אחד.
        </p>
        <p className="text-md text-gray-600 mt-4">
          התחברות למערכת זמינה רק למשתמשים רשומים.
        </p>
      </div>
    </main>
  );
}
