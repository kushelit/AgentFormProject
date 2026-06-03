'use client';

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";
import SharonSummaryPage from "@/components/Sharon/SharonSummaryPage";

const SharonCommissionsSummaryPage = () => {
  const { user, isLoading, detail } = useAuth();
  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const { canAccess, isChecking } = usePermission(
    user ? "access_sharon_summary" : null
  );

  useEffect(() => {
    setIsClient(true);
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (!isClient) return null;

  if (isLoading || isChecking || !ready || !user || !detail) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>;
  }

  if (!user) {
    return (
      <div className="text-custom-white px-4 py-2 rounded-lg">
        נדרש להתחבר למערכת כדי לגשת לדף זה.
      </div>
    );
  }

  if (canAccess === false) {
    return <AccessDenied />;
  }

  return (
    <Suspense fallback={<div>טוען...</div>}>
      <SharonSummaryPage />
    </Suspense>
  );
};

export default SharonCommissionsSummaryPage;
