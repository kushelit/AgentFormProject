'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useEffect, useState } from "react";
import { redirect } from 'next/navigation';
import { db } from "@/lib/firebase/firebase";
import { doc, setDoc } from "firebase/firestore";
import Link from 'next/link';


export default function AgentSignUpPage() {
  const { user, signUp } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      redirect('/');
    };
  }, [user]);

  const handleSignUp: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    const values = new FormData(event.currentTarget);
    const name = values.get("name") as string | null;
    const email = values.get("email") as string | null;
    const password = values.get("password") as string | null;
    const confirmPassword = values.get("password-confirm") as string | null;

    if (!email || !password || !name || !confirmPassword) {
      setError('אנא מלא/י את כל השדות');
      return;
    }

    if (password !== confirmPassword) {
      setError('הסיסמאות לא תואמות');
      return;
    }

    signUp(email, password)
      .then((userCredential) => {
        const docRef = doc(db, 'users', userCredential.user.uid);
        setDoc(docRef, {
          name,
          email,
          role: 'agent',
          agentId: userCredential.user.uid,
          isActive: true,
        });
        redirect('/auth/log-in');
      })
      .catch((err) => {
        console.error({ err });
        setError(err.code);
      });
  };

  return (
    <form onSubmit={handleSignUp} className="space-y-4 max-w-md w-full mx-auto p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold text-center text-blue-900">יצירת משתמש</h2>

      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          שם הסוכן <span className="text-red-500">*</span>
        </label>
        <input type="text" id="name" name="name" required className="w-full border border-gray-300 rounded px-3 py-2" />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          כתובת מייל <span className="text-red-500">*</span>
        </label>
        <input type="email" id="email" name="email" required className="w-full border border-gray-300 rounded px-3 py-2" />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          סיסמא <span className="text-red-500">*</span>
        </label>
        <input type="password" id="password" name="password" required className="w-full border border-gray-300 rounded px-3 py-2" />
      </div>

      <div>
        <label htmlFor="password-confirm" className="block text-sm font-medium">
          אימות סיסמא <span className="text-red-500">*</span>
        </label>
        <input type="password" id="password-confirm" name="password-confirm" required className="w-full border border-gray-300 rounded px-3 py-2" />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button type="submit" className="w-full bg-blue-900 text-white py-2 rounded hover:bg-blue-800">
        הרשמה
      </button>

      <div className="border-t pt-4 text-center text-sm text-gray-600">
        <span className="px-2">או</span>
        <Link href="/auth/log-in" className="text-blue-600 hover:underline">התחברות</Link>
        </div>
    </form>
  );
}
