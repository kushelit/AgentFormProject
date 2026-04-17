"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase/firebase";

export default function ProtectedClient({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });

    return () => unsub();
  }, []);

  if (!ready) {
    return <div className="p-6 text-center">טוען...</div>;
  }

  if (!user) {
    return <div className="p-6 text-center">יש להתחבר למערכת</div>;
  }

  return <>{children}</>;
}