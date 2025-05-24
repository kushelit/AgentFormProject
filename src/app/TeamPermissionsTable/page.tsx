'use client';

import { Suspense, useEffect, useState } from "react";
import TeamPermissionsTable from "./TeamPermissionsTable";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";

const TeamPermissionsTablePage = () => {
  const { user, isLoading, detail } = useAuth();
  const { canAccess, isChecking } = usePermission("access_teamPermissionsTable");

  const [isClient, setIsClient] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // שלב טעינה ראשוני
  if (
    !isClient ||
    isLoading ||
    isChecking ||
    !ready ||
    user === undefined ||
    detail === undefined
  ) {
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
  if (canAccess === false) {
    return <AccessDenied />;
  }

  // הצגת תוכן בפועל
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TeamPermissionsTable />
    </Suspense>
  );
};

export default TeamPermissionsTablePage;
