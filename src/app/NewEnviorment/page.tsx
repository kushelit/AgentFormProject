'use client';

import { Suspense, useEffect, useState } from "react";
import NewEnviorment from "./NewEnviorment";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";

const NewEnviormentPage = () => {
  const { user, isLoading,detail } = useAuth();
  const [ready, setReady] = useState(false);

  const { canAccess, isChecking } = usePermission("access_manageEnviorment");

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading || isChecking || !ready || !user || !detail) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>;
  }

  if (!user) {
    return (
      <div className="text-custom-white px-4 py-2 rounded-lg">
        נדרש להתחבר למערכת כדי לגשת לדף זה.
      </div>
    );
  }

   // אין הרשאה – תנאי מדויק
   if (canAccess === false) {
    return <AccessDenied />;
  }


  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewEnviorment />
    </Suspense>
  );
};

export default NewEnviormentPage;
