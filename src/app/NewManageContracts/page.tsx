'use client';

import { Suspense, useEffect, useState } from "react";
import NewManageContracts from "./NewManageContracts";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";

const ManageContractsPage = () => {
  const { user, detail, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // אם עדיין טוען מידע – מחכים
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

  // אם המשתמש הוא 'worker' – אין גישה
  if (detail?.role === 'worker') {
    return <AccessDenied />;
  }

  // אם הכול תקין – הצג את הרכיב
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewManageContracts />
    </Suspense>
  );
};

export default ManageContractsPage;
