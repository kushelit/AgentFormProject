'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useEffect, useMemo, useState } from "react";
import { redirect, notFound } from 'next/navigation';
import { db } from "@/lib/firebase/firebase";
import { collection, doc, setDoc, getDoc } from "firebase/firestore";

export default function WorkerSignUpPage({ params }: { params: { agentId: string } }) {
  const { user, signUp } = useAuth();
  const [error, setError] = useState('');

  const [agent, setAgent] = useState<{ name: string } | null>(null);

  useEffect(() => {
    const docRef = doc(db, 'users', params.agentId);
    getDoc(docRef)
    .then((doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.role !== 'agent') {
          notFound();
          return;
        }
        setAgent(data as { name: string });
      } else {
        notFound();
        return;
      }
    })
  }, [params.agentId, setAgent]);

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

    signUp(email, password)
      .then((userCredential) => {
        const docRef = doc(db, 'users', userCredential.user.uid);
        setDoc(docRef, {
          name,
          email,
          role: 'worker',
          agentId: params.agentId,
        });

        redirect('/');
      })
      .catch((err) => {
        console.error({err});
        setError(err.code);
      });
  }

  if (!agent) {
    return <div>Loading...</div>;
  }

  return (
    <form onSubmit={handleSignUp}>
      <h1    style={{ paddingTop: '4rem' }}>Worker Sign up for <span className="font-bold">Agent {agent.name}</span></h1>
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