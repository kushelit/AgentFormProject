'use client';

import { Suspense, useEffect, useState } from "react";
import NewSummaryTable from "./NewSummaryTable";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";

const NewSummaryTablePage = () => {
  const { user, detail, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  // השהיה קצרה כדי להבטיח שהכל נטען כראוי לפני הצגה
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

 // במקום `return null`
if (isLoading || !ready || user === undefined || detail === undefined) {
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

  // משתמש מחובר אבל הוא worker
  if (detail?.role === 'worker') {
    return <AccessDenied />;
  }

  // משתמש מחובר ומורשה
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewSummaryTable />
    </Suspense>
  );
};

export default NewSummaryTablePage;
