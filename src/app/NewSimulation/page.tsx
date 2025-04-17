'use client';

import { Suspense, useEffect, useState } from "react";
import NewSimulation from "./NewSimulation";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";

const NewSimulationPage = () => {
  const { user, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  const { canAccess, isChecking } = usePermission("access_simulation");

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading || !ready || isChecking || user === undefined) {
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

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewSimulation />
    </Suspense>
  );
};

export default NewSimulationPage;
