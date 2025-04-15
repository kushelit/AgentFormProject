'use client';

import { Suspense, useEffect, useState } from "react";
import NewSimulation from "./NewSimulation";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";

const NewSimulationPage = () => {
  const { user, detail, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // אם עדיין טוען מידע – הצג טעינה
  if (isLoading || !ready || user === undefined || detail === undefined) {
    return (
      <div className="p-4 text-gray-600">
        ⏳ טוען מידע...
      </div>
    );
  }

  // אם אין משתמש מחובר
  if (!user) {
    return (
      <div className="text-custom-white px-4 py-2 rounded-lg">
        נדרש להתחבר למערכת כדי לגשת לדף זה.
      </div>
    );
  }

  // אם אין הרשאות
  if (!detail) {
    return <AccessDenied />;
  }

  // הצג את הדף אם הכול תקין
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewSimulation />
    </Suspense>
  );
};

export default NewSimulationPage;
