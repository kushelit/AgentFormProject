// src/app/importCommissionHub/onboard/page.tsx
'use client';

import { Suspense } from 'react';
import OnboardClient from './onboard-client';
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import AccessDenied from '@/components/AccessDenied';
import { useSearchParams } from 'next/navigation';

export default function OnboardPage() {
  const { user, isLoading, detail } = useAuth();
  const { canAccess, isChecking } = usePermission(user ? 'access_commission_import' : null);

  // שולפים פרמטרים מה-URL (ללא תלות ב-server page)
  const spHook = useSearchParams();
  const sp: Record<string, string> = {
    agentId:     spHook.get('agentId')     || '',
    reportMonth: spHook.get('reportMonth') || spHook.get('repYm') || '',
    companyId:   spHook.get('companyId')   || '',
    templateId:  spHook.get('templateId')  || '',
  };

  if (isLoading || isChecking || !user || !detail) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>;
  }
  if (!user) return <div className="text-custom-white px-4 py-2 rounded-lg">נדרש להתחבר למערכת כדי לגשת לדף זה.</div>;
  if (canAccess === false) return <AccessDenied />;

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OnboardClient searchParams={sp} />
    </Suspense>
  );
}
