"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const monitorTabs = [
  {
    href: "/MagicTouch/Monitor/Jobs",
    label: "עיבודים",
    icon: "🕒",
  },
  {
    href: "/MagicTouch/Monitor/Bookings",
    label: "Microsoft Bookings",
    icon: "📅",
  },
  {
    href: "/MagicTouch/Monitor/GoogleCalendar",
    label: "Google Calendar",
    icon: "🗓️",
  },
  {
    href: "/MagicTouch/Monitor",
    label: "מעקב ייפויי כוח",
    icon: "✍️",
  },
  {
    href: "/MagicTouch/Monitor/Tools",
    label: "כלי בדיקה",
    icon: "🧪",
  },
];

export default function MonitorTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="עיבודים וכלי מערכת"
      className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
    >
      {monitorTabs.map((tab) => {
        const active =
          tab.href === "/MagicTouch/Monitor"
            ? pathname === tab.href
            : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition",
              active
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-700 hover:bg-slate-100",
            ].join(" ")}
          >
            <span aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}