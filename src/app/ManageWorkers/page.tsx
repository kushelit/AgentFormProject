'use client';

import { Suspense, useEffect, useState } from "react";
import ManageWorkers from "./ManageWorkers";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";

const ManageWorkersPage = () => {
  const { user, detail, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // עדיין טוען נתונים – מונע מהבהובים
  if (isLoading || !ready || user === undefined || detail === undefined) {
    return (
      <div className="p-4 text-gray-600">
        ⏳ טוען מידע...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-custom-white px-4 py-2 rounded-lg">
        נדרש להתחבר למערכת כדי לגשת לדף זה.
      </div>
    );
  }

  if (detail?.role === 'worker') {
    return <AccessDenied />;
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ManageWorkers />
    </Suspense>
  );
};

export default ManageWorkersPage;
