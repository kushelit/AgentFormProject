'use client';

import { Suspense } from "react";
import NewSimulation from "./NewSimulation";
import Link from "next/link"; // Import Link for navigation
import { useAuth } from "@/lib/firebase/AuthContext";
import AccessDenied from "@/components/AccessDenied";




const NewSimulationPage = () => {
  const { user, detail } = useAuth(); // Destructure to get both user and detail objects

  let content;

  if (user) {
    if (detail) {
      // If the user is logged in and their role is not 'worker'
      content = (
        <Suspense fallback={<div>Loading...</div>}>
          <NewSimulation />
        </Suspense>
      );
    } else {
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


export default NewSimulationPage;