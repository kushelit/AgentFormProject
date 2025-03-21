'use client';

import { Suspense } from "react";
import NewEnviorment from "./NewEnviorment";
import Link from "next/link"; // Import Link for navigation
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";




const NewEnviormentPage = () => {
  const { user, detail } = useAuth(); // Destructure to get both user and detail objects

  let content;

  if (user) {
    if (detail?.role !== 'worker') {
      // If the user is logged in and their role is not 'worker'
      console.log("Not a worker, showing SummaryTable");
      content = (
        <Suspense fallback={<div>Loading...</div>}>
          <NewEnviorment />
        </Suspense>
      );
    } else {
      // If the user is a 'worker'
      return <AccessDenied />;
      console.log("User is a worker, showing access denied message");

    }
  } else {
    // If the user is not logged in
    content = <div className="text-custom-white px-4 py-2 rounded-lg">נדרש להתחבר למערכת כדי לגשת לדף זה.</div>;
      console.log("User is not logged in, asking to log in");

  }

  return <div>{content}</div>;
};


export default NewEnviormentPage;