"use client";


import React from "react";

import {
  useAuth,
} from "@/lib/firebase/AuthContext";

import {
  useMagicTouchAgent,
} from "@/components/MagicTouch/MagicTouchAgentContext";

import {
  usePermission,
} from "@/hooks/usePermission";

import AccessDenied from
  "@/components/AccessDenied";

import GoogleCalendarSetup from
  "@/components/MagicTouch/Integrations/GoogleCalendarSetup";

export default function GoogleCalendarSettingsContent() {
  const {
    effectiveAgentId,
  } =
    useMagicTouchAgent();

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
        ? "access_magic_touch"
        : null
    );

  const agentId =
    effectiveAgentId;

  if (
    isLoading ||
    isChecking
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-5xl p-6"
      >
        <div className="rounded-xl border bg-white p-6">
          טוען הגדרות Google Calendar...
        </div>
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
      className="mx-auto max-w-5xl space-y-6 p-6 text-right"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-950">
          Google Calendar
        </h1>

        <p className="text-sm leading-6 text-slate-600">
          חיבור Google Calendar מאפשר ל-MagicTouch
          לעבוד עם היומן של הסוכן ולשלב פגישות
          בתהליכי האוטומציה.
        </p>
      </header>

      {!agentId ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          לא נמצא agentId לסוכן הפעיל.
        </div>
      ) : (
        <GoogleCalendarSetup
          agentId={
            agentId
          }
        />
      )}
    </main>
  );
}
