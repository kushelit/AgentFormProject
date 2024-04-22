'use client';

import { Suspense } from "react";
import ManageWorkers from "./ManageWorkers";
import Link from "next/link"; // Import Link for navigation
import { useAuth } from "@/lib/firebase/AuthContext";



const ManageWorkersPage = () => {
  const { user } = useAuth(); // Destructure to get the user object

  return (
    <div> 
      {user ? (
    <Suspense>
      <ManageWorkers />
    </Suspense>
  ) : (
    <div className="text-custom-white px-4 py-2 rounded-lg">
    נדרש להתחבר למערכת
  </div>
  )}
</div>
);
};

export default ManageWorkersPage;