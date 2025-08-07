// app/Commission/ExcelCommissionImporterPage.tsx

'use client';

import { Suspense, useEffect, useState } from "react";
import ExcelCommissionImporter from "./ExcelCommissionImporter";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";

const ExcelCommissionImporterPage = () => {
  const { user, isLoading } = useAuth();
  const { canAccess, isChecking } = usePermission("access_commissionImport");

  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // זיהוי צד לקוח בלבד
  useEffect(() => {
    setIsClient(true);
  }, []);

  // השהיית הצגה חלקה
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (!isClient) return null;

  if (isLoading || isChecking || !ready || user === undefined) {
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
      <ExcelCommissionImporter />
    </Suspense>
  );
};

export default ExcelCommissionImporterPage;
