'use client';

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";
import SharonPage from "@/components/Sharon/SharonPage";

const SharonTransactionsPage = () => {
  const { user, isLoading, detail } = useAuth();
  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const { canAccess: canAccessElementary, isChecking: isCheckingElementary } = usePermission(
  user ? "access_sharon_elementary" : null
);
const { canAccess: canAccessTax, isChecking: isCheckingTax } = usePermission(
  user ? "access_sharon_tax_returns" : null
);
const { canAccess: canAccessPension, isChecking: isCheckingPension } = usePermission(
  user ? "access_sharon_pension" : null
);

const isChecking = isCheckingElementary || isCheckingTax || isCheckingPension;
const canAccess = canAccessElementary || canAccessTax || canAccessPension;


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

if (!isChecking && !canAccess) {
    return <AccessDenied />;
  }

  return (
    <Suspense fallback={<div>טוען...</div>}>
      <SharonPage />
    </Suspense>
  );
};

export default SharonTransactionsPage;
