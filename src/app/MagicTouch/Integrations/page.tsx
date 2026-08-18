"use client";

import React from "react";
import Link from "next/link";

type IntegrationCardProps = {
  title: string;
  description: string;
  href: string;
  icon: string;
  statusText?: string;
};

function IntegrationCard({
  title,
  description,
  href,
  icon,
  statusText,
}: IntegrationCardProps) {
  return (
    <Link
      href={href}
      className={[
        "block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition",
        "hover:-translate-y-0.5 hover:shadow-md",
      ].join(" ")}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">
              {title}
            </h2>

            {statusText ? (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                {statusText}
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {description}
          </p>

          <div className="mt-4 text-sm font-bold text-blue-700">
            מעבר להגדרות ←
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function MagicTouchIntegrationsPage() {
  return (
    <main
      dir="rtl"
      className="mx-auto max-w-6xl space-y-6 p-6 text-right"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">
          ייבוא וחיבורים
        </h1>

        <p className="text-sm leading-6 text-slate-600">
          כאן מנהלים את החיבורים החיצוניים של MagicTouch:
          WhatsApp, יומנים ומערכות מקור.
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        <IntegrationCard
          title="WhatsApp Business"
          description="חיבור מספר WhatsApp Business של הסוכן דרך Meta."
          href="/MagicTouch/Integrations/WhatsApp"
          icon="💬"
          statusText="חיבור"
        />

        <IntegrationCard
          title="Microsoft Bookings"
          description="חיבור Microsoft 365, בחירת עסק Bookings וסנכרון פגישות."
          href="/MagicTouch/Integrations/MicrosoftBookings"
          icon="📅"
          statusText="יומן"
        />

        <IntegrationCard
          title="Google Calendar"
          description="חיבור חשבון Google, בחירת היומן והגדרת קישור לקביעת פגישה."
          href="/MagicTouch/Integrations/GoogleCalendarSettings"
          icon="🗓️"
          statusText="יומן"
        />

        <IntegrationCard
          title="Surense"
          description="מרכז אחד לכל כיווני התקשורת בין MagicTouch, Make ושורנס."
          href="/MagicTouch/Integrations/Surense"
          icon="🔄"
          statusText="מרכז אינטגרציה"
        />

        <IntegrationCard
          title="ייבוא אנשי קשר"
          description="ייבוא אנשי קשר מ־Excel וממקורות חיצוניים אל MagicTouch."
          href="/MagicTouch/Contacts"
          icon="📥"
          statusText="ייבוא"
        />
      </section>
    </main>
  );
}