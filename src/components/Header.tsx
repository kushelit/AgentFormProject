'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import Link from "next/link";
import { usePathname } from 'next/navigation';

export default function Header() {
  const { user, detail, logOut } = useAuth();

  return (
    <>
      <header className="bg-gray-200 p-6 flex items-center gap-5">
        <Link href='/'>מערכת לניהול מכירות</Link>

        {user ? (
          <div className="flex items-center gap-3">
            <span>{detail?.name}</span>
            <span>{user.email}</span>
            <button onClick={logOut}>Log Out</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/auth/log-in">Log in</Link>
            <Link href="/auth/sign-up/agent">Agent sign up</Link>
          </div>
        )}
      </header>

      {detail?.role === 'agent' ? (
      <Link href={`/auth/sign-up/${user?.uid}`} className="text-blue-600 underline">Create worker user</Link>
      ) : null}
    </>
  )
}