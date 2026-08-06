"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/lib/firebase/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import AccessDenied from "@/components/AccessDenied";

const monitorTabs = [
  {
    href: "/MagicTouch/Monitor",
    label: "ייפויי כוח",
    icon: "✍️",
  },
  {
    href: "/MagicTouch/Monitor/Jobs",
    label: "עיבודים",
    icon: "🕒",
  },
  {
    href: "/MagicTouch/Monitor/Tools",
    label: "כלי בדיקה",
    icon: "🧪",
  },
];

const tools = [
  {
    href:
      "/MagicTouch/Integrations/Surense/GetCustomerTest",

    title:
      "בדיקת Get Customer ב־Surense",

    description:
      "בדיקת לקוח חתום, לקוח שלא חתם או מזהה לקוח מותאם, והצגת התגובה הגולמית שחוזרת מ־Surense.",

    icon:
      "🔍",

    badge:
      "טסט בלבד",

    cardClass:
      "border-purple-200 bg-purple-50 hover:border-purple-400",

    iconClass:
      "bg-purple-100",

    titleClass:
      "text-purple-900",

    badgeClass:
      "bg-purple-100 text-purple-700",

    linkClass:
      "text-purple-700",
  },

  {
    href:
      "/MagicTouch/Tools/CreateSignedSurenseTestContact",

    title:
      "הקמה ואיפוס לקוח חתום לבדיקה",

    description:
      "הקמת לקוח Surense חתום במסד או החזרתו לסטטוס ממתין לחתימה לצורך בדיקה חוזרת של העיבוד.",

    icon:
      "👤",

    badge:
      "טסט בלבד",

    cardClass:
      "border-amber-200 bg-amber-50 hover:border-amber-400",

    iconClass:
      "bg-amber-100",

    titleClass:
      "text-amber-900",

    badgeClass:
      "bg-amber-100 text-amber-700",

    linkClass:
      "text-amber-700",
  },

  {
    href:
  "/MagicTouch/Tools/TestContactReset",
    title:
      "איפוס נתוני לקוח לבדיקה",

    description:
      "מעבר לכלי האיפוס הקיים שמנקה אירועים, הרצות Flow, קמפיינים, שיחות WhatsApp ונתוני בדיקה של איש הקשר.",

    icon:
      "🧹",

    badge:
      "זמני",

    cardClass:
      "border-rose-200 bg-rose-50 hover:border-rose-400",

    iconClass:
      "bg-rose-100",

    titleClass:
      "text-rose-900",

    badgeClass:
      "bg-rose-100 text-rose-700",

    linkClass:
      "text-rose-700",
  },
];

function MonitorTabs() {
  const pathname =
    usePathname();

  return (
    <nav
      aria-label="מעקב ובקרה"
      className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
    >
      {monitorTabs.map(
        (
          tab
        ) => {
          const active =
            tab.href ===
              "/MagicTouch/Monitor"
              ? pathname ===
                tab.href
              : pathname.startsWith(
                tab.href
              );

          return (
            <Link
              key={
                tab.href
              }
              href={
                tab.href
              }
              className={[
                "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition",

                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-700 hover:bg-slate-100",
              ].join(" ")}
            >
              <span
                aria-hidden="true"
              >
                {tab.icon}
              </span>

              <span>
                {tab.label}
              </span>
            </Link>
          );
        }
      )}
    </nav>
  );
}

export default function MagicTouchMonitorToolsPage() {
  const {
    user,
    isLoading,
  } =
    useAuth() as any;

  const {
    canAccess,
    isChecking,
  } =
    usePermission(
      user
        ? "access_magic_touch_jobs_admin"
        : null
    );

  if (
    isLoading ||
    isChecking
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-7xl p-6"
      >
        טוען כלי בדיקה...
      </main>
    );
  }

  if (
    !canAccess
  ) {
    return (
      <AccessDenied />
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 px-4 py-6 text-right sm:px-6"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <MonitorTabs />

        <header>
          <div className="text-sm font-semibold text-blue-600">
            MagicTouch · מעקב ובקרה
          </div>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            כלי בדיקה ותחזוקה
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            ריכוז כלי הטסט והתחזוקה הפנימיים של
            MagicTouch. הכלים בעמוד זה מיועדים למנהל
            המערכת בלבד.
          </p>
        </header>

        <section className="grid gap-5 md:grid-cols-2">
          {tools.map(
            (
              tool
            ) => (
              <Link
                key={
                  tool.href
                }
                href={
                  tool.href
                }
                className={[
                  "block rounded-2xl border p-6 shadow-sm transition hover:shadow-md",
                  tool.cardClass,
                ].join(" ")}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={[
                      "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl",
                      tool.iconClass,
                    ].join(" ")}
                  >
                    {
                      tool.icon
                    }
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        className={[
                          "text-lg font-bold",
                          tool.titleClass,
                        ].join(" ")}
                      >
                        {
                          tool.title
                        }
                      </h2>

                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-bold",
                          tool.badgeClass,
                        ].join(" ")}
                      >
                        {
                          tool.badge
                        }
                      </span>
                    </div>

                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {
                        tool.description
                      }
                    </p>

                    <div
                      className={[
                        "mt-4 text-sm font-bold",
                        tool.linkClass,
                      ].join(" ")}
                    >
                      מעבר לכלי ←
                    </div>
                  </div>
                </div>
              </Link>
            )
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">
            הערה
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            כלי איפוס נתוני הלקוח עדיין נמצא כרגע בתוך
            מסך החיבורים. לאחר שנבדוק שהעמוד החדש עובד,
            נעביר אותו לכאן באופן מלא ונוכל להסיר את
            הכרטיס הישן ממסך החיבורים.
          </p>
        </section>
      </div>
    </main>
  );
}
