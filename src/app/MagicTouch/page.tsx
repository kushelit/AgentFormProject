'use client';

import Link from 'next/link';

export default function MagicTouchDashboardPage() {
  return (
    <div
      dir="rtl"
      className="mx-auto max-w-7xl"
    >
      <header className="mb-7">
        <div className="text-sm font-semibold text-blue-600">
          Magic Touch
        </div>

        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          דשבורד
        </h1>

        <p className="mt-2 text-slate-600">
          תמונת מצב של אנשי הקשר, השיחות, הקמפיינים והאוטומציות.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link
          href="/MagicTouch/Contacts"
          className="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="text-2xl">👥</div>

          <div className="mt-4 text-lg font-bold text-slate-900">
            אנשי קשר
          </div>

          <div className="mt-1 text-sm text-slate-500">
            צפייה וניהול אנשי הקשר מכל המקורות
          </div>
        </Link>

        <Link
          href="/MagicTouch/Conversations"
          className="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="text-2xl">💬</div>

          <div className="mt-4 text-lg font-bold text-slate-900">
            שיחות
          </div>

          <div className="mt-1 text-sm text-slate-500">
            ניהול שיחות WhatsApp
          </div>
        </Link>

        <Link
          href="/MagicTouch/Campaigns"
          className="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="text-2xl">📣</div>

          <div className="mt-4 text-lg font-bold text-slate-900">
            קמפיינים
          </div>

          <div className="mt-1 text-sm text-slate-500">
            יצירה ושליחה של קמפיינים
          </div>
        </Link>

        <Link
          href="/MagicTouch/Workflows"
          className="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="text-2xl">⚡</div>

          <div className="mt-4 text-lg font-bold text-slate-900">
            אוטומציות
          </div>

          <div className="mt-1 text-sm text-slate-500">
            בניית תהליכי עבודה אוטומטיים
          </div>
        </Link>
      </section>

      <section className="mt-7 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">
          ברוכים הבאים ל־Magic Touch
        </h2>

        <p className="mt-2 max-w-3xl leading-7 text-slate-600">
          המודול מרכז אנשי קשר, שיחות WhatsApp, קמפיינים,
          פגישות ואוטומציות במקום אחד. הנתונים יכולים להגיע
          משורנס, MagicSale, Excel ומערכות CRM נוספות.
        </p>
      </section>
    </div>
  );
}