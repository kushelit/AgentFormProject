'use client';

import { Suspense, useEffect, useState } from "react";
import NewAgentForm from "../NewAgentForm/NewAgentForm";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import GlobalAnnouncementPopup from "@/components/announcements/GlobalAnnouncementPopup";
import { usePermission } from "@/hooks/usePermission";

const NewAgentFormPage = () => {
  const { user, isLoading, detail } = useAuth();
  const [ready, setReady] = useState(false);
  const [isClient, setIsClient] = useState(false);

  const { canAccess, isChecking } = usePermission("access_agentForm");

  useEffect(() => {
    setIsClient(true);
    const timer = setTimeout(() => {
      setReady(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // מניעת hydration error
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

  // הכל תקין – מציג טופס וסרגל הודעות
  return (
    <>
      <GlobalAnnouncementPopup />
      <Suspense fallback={<div>Loading...</div>}>
        <NewAgentForm />
      </Suspense>
    </>
  );
};

export default NewAgentFormPage;
