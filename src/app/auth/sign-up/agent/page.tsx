'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useEffect, useState } from "react";
import { redirect } from 'next/navigation';
import { db } from "@/lib/firebase/firebase";
import { collection, doc, setDoc } from "firebase/firestore";

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
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
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
        });
        redirect('/');
      })
      .catch((err) => {
        console.error({err});
        setError(err.code);
      });
  }

  return (
    <form onSubmit={handleSignUp}>
      <h1>Agent Sign up</h1>
      <div>
        <label htmlFor="name">Name</label>
        <input type="text" id="name" name="name" required />
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input type="email" id="email" name="email" required />
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input type="password" id="password" name="password" required />
      </div>
      <div>
        <label htmlFor="password-confirm">Confirm Password</label>
        <input type="password" id="password-confirm" name="password-confirm" required />
      </div>
      {error && <p className="text-red-500">{error}</p>}

      <button type="submit">Sign up</button>
    </form>
  )
}