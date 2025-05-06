// File: /app/(admin)/subscriptions/page.tsx
'use client';

import { Suspense, useEffect, useState } from "react";
import  SubscriptionsTable  from "./SubscriptionsTable";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";

const SubscriptionsPage = () => {
  const { user, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const { canAccess, isChecking } = usePermission("access_manageSubscriptions");

  if (isLoading || !ready || isChecking || user === undefined) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>;
  }

  if (!user) {
    return (
      <div className="text-custom-white px-4 py-2 rounded-lg">
        נדרש להתחבר למערכת כדי לגשת לדף זה.
      </div>
    );
  }

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SubscriptionsTable />
    </Suspense>
  );
};

export default SubscriptionsPage;
