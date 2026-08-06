"use client";

import React from "react";
import AccessDenied from "@/components/AccessDenied";
import MagicTouchFlowTemplatesPage from "@/components/MagicTouch/Flows/Templates/MagicTouchFlowTemplatesPage";
import { useAuth } from "@/lib/firebase/AuthContext";
import { usePermission } from "@/hooks/usePermission";

export default function MagicTouchFlowTemplatesRoute() {
  const { user, isLoading } = useAuth();
  const { canAccess, isChecking } = usePermission(
    user ? "access_magic_touch_jobs_admin" : null
  );

  if (isLoading || isChecking || !user) {
    return <div className="p-6 text-slate-600">טוען בנק תבניות...</div>;
  }

  if (!canAccess) {
    return <AccessDenied />;
  }

  return <MagicTouchFlowTemplatesPage />;
}
