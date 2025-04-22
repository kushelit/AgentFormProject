'use client';

import { Suspense, useEffect, useState } from "react";
import NewAgentForm from "../NewAgentForm/NewAgentForm";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import GlobalAnnouncementPopup from "@/components/announcements/GlobalAnnouncementPopup";
import { usePermission } from "@/hooks/usePermission";

const NewAgentFormPage = () => {
  const { user, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  const { canAccess, isChecking } = usePermission("access_agentForm");

  // ממתין מעט לפני שמרנדר את התוכן
  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  // שלבי טעינה
  if (isLoading || !ready || isChecking || user === undefined) {
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
  if (!canAccess) {
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