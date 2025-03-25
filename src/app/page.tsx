'use client';

import AgentForm from "@/components/AgentForm";
import { useAuth } from "@/lib/firebase/AuthContext";
import Link from "next/link";

console.log(useAuth)

export default function Page() {
  const { user, logOut } = useAuth();

//   return (
//     <div className="title-container">
//       {user ? (
//         <>
//           {/* <pre className="text-left p-4">{JSON.stringify(user, undefined, 2)}</pre> */}
//           <AgentForm />
//         </>
//       ) : (
//         <Link href='/auth/log-in' className="border px-4 py-2 rounded-lg">Log in</Link>
//       )}
//     </div>
//   )
// }

if (!user) {
  return null; // מחזיר דף ריק אם המשתמש לא מחובר
}

return (
  <div className="title-container">
    <AgentForm />
  </div>
);
}