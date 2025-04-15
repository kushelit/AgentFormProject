'use client';

import NewAgentForm from "./NewAgentForm/NewAgentForm";
import { useAuth } from "@/lib/firebase/AuthContext";
import Link from "next/link";

console.log(useAuth)

export default function Page() {
  const { user, logOut } = useAuth();


if (!user) {
  return null; // מחזיר דף ריק אם המשתמש לא מחובר
}

return (
  <div className="title-container">
    <NewAgentForm />
  </div>
);
}