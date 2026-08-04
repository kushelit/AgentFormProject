"use client";

import React from "react";
import Link from "next/link";

type IntegrationCardProps = {
  title: string;
  description: string;
  href: string;
  icon: string;
  statusText?: string;
  danger?: boolean;
};

function IntegrationCard({
  title,
  description,
  href,
  icon,
  statusText,
  danger = false,
}: IntegrationCardProps) {
  return (
    <Link
      href={href}
      className={[
        "block rounded-2xl border bg-white p-5 shadow-sm transition",
        "hover:-translate-y-0.5 hover:shadow-md",
        danger
          ? "border-rose-200 hover:border-rose-300"
          : "border-slate-200",
      ].join(" ")}
    >
      <div className="flex items-start gap-4">
        <div
          className={[
            "flex h-12 w-12 items-center justify-center rounded-xl text-2xl",
            danger
              ? "bg-rose-50"
              : "bg-slate-100",
          ].join(" ")}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              className={[
                "text-lg font-bold",
                danger
                  ? "text-rose-900"
                  : "text-slate-900",
              ].join(" ")}
            >
              {title}
            </h2>

            {statusText ? (
              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-bold",
                  danger
                    ? "bg-rose-50 text-rose-700"
                    : "bg-blue-50 text-blue-700",
                ].join(" ")}
              >
                {statusText}
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {description}
          </p>

          <div
            className={[
              "mt-4 text-sm font-bold",
              danger
                ? "text-rose-700"
                : "text-blue-700",
            ].join(" ")}
          >
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

      <section className="space-y-3 border-t border-slate-200 pt-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            כלי פיתוח ובדיקות
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            כלים זמניים לסביבת הטסט בלבד.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <IntegrationCard
            title="איפוס נתוני לקוח לבדיקה"
            description="מחיקת אירועים, הרצות Flow, נתוני קמפיין ושיחות WhatsApp עבור איש קשר מסוים, בלי למחוק את איש הקשר עצמו."
            href="/MagicTouch/Integrations/TestContactReset"
            icon="🧹"
            statusText="טסט בלבד"
            danger
          />
        </div>
      </section>
    </main>
  );
}