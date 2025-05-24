'use client';

import { Suspense, useEffect, useState } from "react";
import NewLeads from "./NewLeads";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";

const NewLeadsPage = () => {
  const { user, isLoading, detail } = useAuth();
  const { canAccess, isChecking } = usePermission("access_flow");

  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // זיהוי שהרנדר הוא בצד הלקוח בלבד
  useEffect(() => {
    setIsClient(true);
  }, []);

  // השהיה להצגה חלקה
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // מניעת hydration error
  if (!isClient) return null;

  // שלבי טעינה
  if (isLoading || isChecking || !ready || !user || !detail) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>;
  }

  // אין יוזר
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

  // הכל תקין – מציג את רכיב הלידים
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewLeads />
    </Suspense>
  );
};

export default NewLeadsPage;
