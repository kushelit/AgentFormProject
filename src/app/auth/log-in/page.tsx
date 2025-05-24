'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useState } from "react";
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

export default function LogInPage() {
  const { logIn } = useAuth();
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogIn: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    const values = new FormData(event.currentTarget);
    const email = values.get("email") as string | null;
    const password = values.get("password") as string | null;

    if (!email || !password) return;

    try {
      const userCredential = await logIn(email, password);
      const userId = userCredential.user.uid;
      const userDoc = await getDoc(doc(db, 'users', userId));

      if (!userDoc.exists()) {
        throw new Error('המשתמש לא נמצא במערכת');
      }

      const userData = userDoc.data();
      if (userData?.isActive === false) {
        throw new Error('המנוי שלך אינו פעיל');
      }

      router.push('/NewAgentForm');
    } catch (err: any) {
      console.error({ err });
      setError(err.message || 'אירעה שגיאה בעת ההתחברות');
    }
  };

  return (
    <div className="max-w-md w-full mx-auto p-6 bg-white rounded shadow">
      <form onSubmit={handleLogIn} className="space-y-4">
        <h1 className="text-2xl font-bold text-center text-blue-900">התחברות</h1>
  
        <div>
          <label htmlFor="email" className="block text-sm font-medium">כתובת מייל</label>
          <input type="email" id="email" name="email" required className="w-full border border-gray-300 rounded px-3 py-2" />
        </div>
  
        <div>
          <label htmlFor="password" className="block text-sm font-medium">סיסמא</label>
          <input type="password" id="password" name="password" required className="w-full border border-gray-300 rounded px-3 py-2" />
        </div>
  
        <div className="text-sm text-right">
          <Link href="/auth/reset-password" className="text-blue-600 hover:underline">שכחת סיסמא?</Link>
        </div>
  
        {error && <p className="text-red-600 text-sm">{error}</p>}
  
        <button type="submit" className="w-full bg-blue-900 text-white py-2 rounded hover:bg-blue-800">כניסה</button>
      </form>
    </div>
  );  
}
