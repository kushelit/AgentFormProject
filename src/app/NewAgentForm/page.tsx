'use client';

import { Suspense, useEffect, useState } from "react";
import NewAgentForm from "../NewAgentForm/NewAgentForm";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import GlobalAnnouncementPopup from "@/components/announcements/GlobalAnnouncementPopup";

const NewAgentFormPage = () => {
  const { user, detail, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  // ממתין מעט לפני שמרנדר את התוכן
  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true);
    }, 300); // ⏳ ממתין 300ms כדי לוודא שהמידע התייצב

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <div className="p-4 text-gray-600">⏳ טוען מידע...</div>; // או spinner
  }


  if (!ready || user === undefined || detail === undefined) {
    return null; // או Loader
  }

  if (!user) {
    return (
      <div className="text-custom-white px-4 py-2 rounded-lg">
        נדרש להתחבר למערכת כדי לגשת לדף זה.
      </div>
    );
  }

  if (user && detail === null) {
    return <AccessDenied />;
  }

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
