'use client';

import { Suspense, useEffect, useState } from "react";
import NewManageContracts from "./NewManageContracts";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";

const ManageContractsPage = () => {
  const { user, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  const { canAccess, isChecking } = usePermission(user ? "access_manageContracts" : null);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // שלב טעינה
  if (isLoading || isChecking || !ready || !user) {
    return (
      <div className="p-4 text-gray-600">
        ⏳ טוען מידע...
      </div>
    );
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
  if (!canAccess) {
    return <AccessDenied />;
  }

  // מוכן להציג
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewManageContracts />
    </Suspense>
  );
};

export default ManageContractsPage;
