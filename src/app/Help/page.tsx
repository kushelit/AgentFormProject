'use client';

import { Suspense, useEffect } from "react";
import HelpCenter from './Help';
import { useAuth } from "@/lib/firebase/AuthContext";


const HelpPage = () => {
  const { user, detail } = useAuth();

  useEffect(() => {
    console.log("User state updated:", user);
  }, [user]); // יתעדכן בכל שינוי של user

  return (
    <div>
      {user ? (
        <Suspense fallback={<div>Loading...</div>}>
          <HelpCenter />
        </Suspense>
      ) : (
        <div className="text-custom-white px-4 py-2 rounded-lg">
          נדרש להתחבר למערכת כדי לגשת לדף זה.
        </div>
      )}
    </div>
  );
};

export default HelpPage;