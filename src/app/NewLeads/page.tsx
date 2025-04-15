'use client';

import { Suspense, useEffect, useState } from "react";
import NewLeads from "./NewLeads";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";

const NewLeadsPage = () => {
  const { user, detail, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  // מוסיפים השהייה קצרה למניעת הבזק שגוי
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // במצב טעינה – לא להציג כלום
  if (isLoading || !ready || user === undefined || detail === undefined) {
    return null; // או אפשר spinner בעתיד
  }

  // לא מחובר
  if (!user) {
    return (
      <div className="text-custom-white px-4 py-2 rounded-lg">
        נדרש להתחבר למערכת כדי לגשת לדף זה.
      </div>
    );
  }

  // אין הרשאות
  if (!detail) {
    return <AccessDenied />;
  }

  // תקין – הצג תוכן
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewLeads />
    </Suspense>
  );
};

export default NewLeadsPage;
