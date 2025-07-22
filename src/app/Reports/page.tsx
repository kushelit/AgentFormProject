'use client';

import { Suspense, useEffect, useState } from 'react';
import ReportViewer from './ReportViewer'; // שם הרכיב הפנימי שיטען את הדוח
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import AccessDenied from '@/components/AccessDenied';

const ReportsPage = () => {
  const { user, isLoading, detail } = useAuth();
  const { canAccess, isChecking } = usePermission('access_reports'); // או כל הרשאה שתגדירי לדוחות

  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (!isClient) return null;

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

  if (canAccess === false) {
    return <AccessDenied />;
  }

  return (
    <Suspense fallback={<div>🔄 טוען דוח...</div>}>
      <ReportViewer />
    </Suspense>
  );
};

export default ReportsPage;
