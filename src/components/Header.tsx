"use client"

import { useAuth } from "@/lib/firebase/AuthContext";
import Link from "next/link";
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useRouter } from "next/navigation"; // ייבוא useRouter



export default function Header() {
  const { user, detail, logOut } = useAuth();
 // console.log(user?.uid)
 const router = useRouter(); // יצירת מופע של router

 // פונקציה שמנהלת את ההתנתקות
 const handleLogout = async () => {
  try {
    await logOut(); // ביצוע התנתקות
    router.push("/auth/log-in"); // ניתוב לדף התחברות
  } catch (error) {
    // console.error("Logout failed:", error);
  }
};

  return (
    <>
      <header className="bg-custom-blue p-4 flex items-center justify-between h-16 sticky top-0 left-0 right-0 w-full z-[1000]">

       <Link href='/'>
          <Image src="/magicSale.jpeg" alt="Logo" width={192} height={64} priority />
        </Link>

        <div className="flex items-center gap-3 text-custom-white">
          {user ? (
            <>
            <span>{detail?.name}</span>
            <span>|</span>
            <button onClick={handleLogout}>יציאה</button> 
   
          </>
          ) : (
            <>
              <Link href="/auth/sign-up/agent">הרשם</Link>
              <Link href="/auth/log-in">התחבר</Link> 
             
            </>
          )}
        </div>
      </header>

   {/*   {detail?.role === 'agent' ? (
        <Link href={`/auth/sign-up/${user?.uid}`} className="text-custom-white underline">Create worker user</Link>
      ) : null} */}
    </>
  )
}