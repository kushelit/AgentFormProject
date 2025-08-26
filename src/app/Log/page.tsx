'use client';

import { Suspense, useEffect, useState } from "react";
import Log from "./Log";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission"; // 🔹 שימוש חדש

const LogPage = () => {
  const { user, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  // השהייה קצרה לטעינה חלקה
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const { canAccess, isChecking } = usePermission(user ? "access_log" : null);

  // טוען מידע או הרשאות
  if (isLoading || !ready || isChecking || !user) {
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

  // אין הרשאה לדף
  if (!canAccess) {
    return <AccessDenied />;
  }

  // הצגת הדף בפועל
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Log />
    </Suspense>
  );
};

export default LogPage;
