'use client';

import { Suspense, useEffect, useState } from "react";
import NewCustomer from "./NewCustomer";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";

const NewCustomerPage = () => {
  const { user, isLoading, detail } = useAuth();
  const { canAccess, isChecking } = usePermission(user ? "access_customer" : null);

  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // מניעת hydration error – אל תרנדר כלום בצד שרת
  if (!isClient) return null;

  // שלבי טעינה
  if (isLoading || isChecking || !ready || !user || !detail) {
    return (
      <div className="p-4 text-gray-600">
        ⏳ טוען מידע...
      </div>
    );
  }

  // לא מחובר
  if (!user) {
    return (
      <div className="text-custom-white px-4 py-2 rounded-lg">
        נדרש להתחבר למערכת כדי לגשת לדף זה.
      </div>
    );
  }

  // אין הרשאה
  if (canAccess === false) {
    return <AccessDenied />;
  }

  // הכל תקין – הצג את הרכיב
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewCustomer />
    </Suspense>
  );
};

export default NewCustomerPage;
