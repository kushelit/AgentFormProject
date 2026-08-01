'use client';

import {
  Suspense,
  useEffect,
  useState,
} from 'react';

import {
  useAuth,
} from '@/lib/firebase/AuthContext';

import {
  usePermission,
} from '@/hooks/usePermission';

import AccessDenied from '@/components/AccessDenied';

import MagicTouchConversationsPage from '@/components/MagicTouch/MagicTouchConversationsPage';

export default function MagicTouchConversationsRoute() {
  const {
    user,
    detail,
    isLoading,
  } =
    useAuth();

  const [
    isClient,
    setIsClient,
  ] =
    useState(false);

  const [
    ready,
    setReady,
  ] =
    useState(false);

  const {
    canAccess,
    isChecking,
  } =
    usePermission(
      user
        ? 'access_magic_touch'
        : null
    );

  useEffect(() => {
    setIsClient(true);

    const timer =
      setTimeout(
        () =>
          setReady(
            true
          ),
        300
      );

    return () =>
      clearTimeout(
        timer
      );
  }, []);

  if (!isClient) {
    return null;
  }

  if (
    isLoading ||
    isChecking ||
    !ready ||
    !user ||
    !detail
  ) {
    return (
      <div className="p-4 text-slate-600">
        ⏳ טוען את שיחות Magic Touch...
      </div>
    );
  }

  if (
    !canAccess
  ) {
    return (
      <AccessDenied />
    );
  }

  return (
    <Suspense
      fallback={
        <div className="p-4 text-slate-600">
          טוען שיחות...
        </div>
      }
    >
      <MagicTouchConversationsPage />
    </Suspense>
  );
}