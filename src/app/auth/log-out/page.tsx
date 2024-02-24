import { useAuth } from "@/lib/firebase/auth";
import { FormEventHandler, useEffect, useState } from "react";
import { redirect } from 'next/navigation';

export default function LogOutPage() {
  const { logOut } = useAuth();

  useEffect(() => {
    logOut();
  }, [logOut]);

  return (
    <div>Logging out</div>
  )
}
