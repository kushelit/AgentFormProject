'use client';

import { Suspense, useEffect, useState } from "react";
import NewEnviorment from "./NewEnviorment";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";

const NewEnviormentPage = () => {
  const { user, isLoading } = useAuth();
  const { canAccess, isChecking } = usePermission(user ? "access_manageEnviorment" : null);

  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // זיהוי אם אנחנו בצד לקוח
  useEffect(() => {
    setIsClient(true);
  }, []);

  // השהיית רינדור להבטחת UI חלק
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // לא לרנדר בכלל בצד שרת
  if (!isClient) return null;

  // שלבי טעינה
  if (isLoading || isChecking || !ready || !user) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>;
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
  if (!canAccess) {
    return <AccessDenied />;
  }

  // הכל תקין
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewEnviorment />
    </Suspense>
  );
};

export default NewEnviormentPage;
