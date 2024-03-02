'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import Link from "next/link";
import { usePathname } from 'next/navigation';
import Image from 'next/image';

export default function Header() {
  const { user, detail, logOut } = useAuth();

 

  return (
    <>
      <header className="bg-custom-blue p-4 flex items-center justify-between h-16">
        <Link href='/'>
          <Image src="/magicSale.jpeg" alt="Logo" width={192} height={64} />
        </Link>

        <div className="flex items-center gap-3 text-custom-white">
          {user ? (
            <>
            <span>{detail?.name}</span>
            <span>|</span>
            <button onClick={logOut}>יציאה</button>
          </>
          ) : (
            <>
              <Link href="/auth/log-in">Log in</Link>
              <Link href="/auth/sign-up/agent">Agent sign up</Link>
            </>
          )}
        </div>
      </header>

      {detail?.role === 'agent' ? (
        <Link href={`/auth/sign-up/${user?.uid}`} className="text-blue-600 underline">Create worker user</Link>
      ) : null}
    </>
  )
}