'use client';

import {
  useEffect,
  useState,
} from 'react';

import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';

import AccessDenied from '@/components/AccessDenied';
import MagicTouchSidebar from '@/components/MagicTouch/MagicTouchSidebar';
import MagicTouchTopBar from '@/components/MagicTouch/MagicTouchTopBar';
import { MagicTouchAgentProvider } from '@/components/MagicTouch/MagicTouchAgentContext';

export default function MagicTouchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    user,
    isLoading,
    detail,
  } = useAuth();

  const [
    isClient,
    setIsClient,
  ] = useState(false);

  const {
    canAccess,
    isChecking,
  } = usePermission(
    user
      ? 'access_magic_touch'
      : null
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  if (
    isLoading ||
    isChecking
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-600">
          ⏳ טוען את Magic Touch...
        </div>
      </div>
    );
  }

  if (!user || !detail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-xl bg-white p-6 shadow">
          נדרש להתחבר למערכת.
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <MagicTouchAgentProvider>
    <div
      dir="rtl"
      className="min-h-screen bg-slate-50"
    >
      <MagicTouchTopBar />
      <MagicTouchSidebar />

      <main className="min-h-screen pt-16 pr-60">
        <div className="w-full p-5 md:p-7">
          {children}
        </div>
      </main>
    </div>
    </MagicTouchAgentProvider>
  );
}