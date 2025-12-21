// app/agency-center/page.tsx
'use client';

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/firebase/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import AccessDenied from "@/components/AccessDenied";
import AgencyCenter from "./AgencyCenter";

const AgencyCenterPage = () => {
  const { user, detail, isLoading } = useAuth();

  const { canAccess, isChecking } = usePermission(
    user ? "access_agency_center" : null
  );

  const [isClient, setIsClient] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (!isClient || isLoading || isChecking || !ready) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>;
  }

  if (!user || !detail) {
    return (
      <div className="text-custom-white px-4 py-2 rounded-lg">
        נדרש להתחבר למערכת כדי לגשת לדף זה.
      </div>
    );
  }

  // ליתר ביטחון – לוקחים גם agencyId וגם agencies מה-DB
  const agencyId =
    (detail as any).agencyId || (detail as any).agencies || "";

  // רק ADMIN עם סוכנות משויכת
  if (!agencyId || detail.role !== "admin") {
    return <AccessDenied />;
  }

  if (canAccess === false) {
    return <AccessDenied />;
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AgencyCenter agencyId={agencyId} />
    </Suspense>
  );
};

export default AgencyCenterPage;
