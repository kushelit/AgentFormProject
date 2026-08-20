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

import MicrosoftBookingsSetup from
  "@/components/MagicTouch/Integrations/MicrosoftBookingsSetup";

export default function MicrosoftBookingsSettings() {
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
          טוען הגדרות Microsoft Bookings...
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
      className="mx-auto max-w-5xl text-right"
    >
      {!agentId ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          לא נמצא agentId לסוכן הפעיל.
        </div>
      ) : (
        <MicrosoftBookingsSetup
          agentId={
            agentId
          }
        />
      )}
    </main>
  );
}
