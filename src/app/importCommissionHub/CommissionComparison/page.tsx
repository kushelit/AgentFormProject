'use client';

import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import AccessDenied from '@/components/AccessDenied';
import CommissionComparison from './CommissionComparison';

const CommissionComparisonPage = () => {
  const { user, isLoading, detail } = useAuth();
  const { canAccess, isChecking } = usePermission(user ? 'access_commission_import' : null);

  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // למנוע hydration mismatch
  if (!isClient) return null;

  // שלבי טעינה
  if (isLoading || isChecking || !ready || !user || !detail) {
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

  // הכול תקין – מציגים את הרכיב
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CommissionComparison />
    </Suspense>
  );
};

export default CommissionComparisonPage;
