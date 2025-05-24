'use client';

import { Suspense, useEffect, useState } from "react";
import ExcelImporter from "@/components/ExcelImporter/ExcelImporter";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { usePermission } from "@/hooks/usePermission";

const ImportExcelPage = () => {
  const { user, isLoading, detail } = useAuth(); // הוספתי גם detail ליתר בטחון
  const { canAccess, isChecking } = usePermission("import_excel");

  const [isClient, setIsClient] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (!isClient || isLoading || isChecking || !ready || user === undefined || detail === undefined) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>;
  }

  if (!user) {
    return <div className="text-custom-white px-4 py-2 rounded-lg">נדרש להתחבר למערכת כדי לגשת לדף זה.</div>;
  }

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ExcelImporter />
    </Suspense>
  );
};

export default ImportExcelPage;
