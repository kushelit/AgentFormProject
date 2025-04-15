'use client';

import { Suspense, useEffect, useState } from "react";
import NewCustomer from "./NewCustomer";
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";

const NewCustomerPage = () => {
  const { user, detail, isLoading } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, []);

  // במקום `return null`
if (isLoading || !ready || user === undefined || detail === undefined) {
  return (
    <div className="p-4 text-gray-600">
      ⏳ טוען מידע...
    </div>
  );
}


  // אין משתמש
  if (!user) {
    return <div className="text-custom-white px-4 py-2 rounded-lg">נדרש להתחבר למערכת כדי לגשת לדף זה.</div>;
  }

  // משתמש מחובר אך לא מורשה
  if (!detail) {
    return <AccessDenied />;
  }

  // משתמש מאושר – טען תוכן
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewCustomer />
    </Suspense>
  );
};

export default NewCustomerPage;
