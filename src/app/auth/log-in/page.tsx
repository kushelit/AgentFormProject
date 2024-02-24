'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useEffect, useState } from "react";
import { redirect } from 'next/navigation';
import Link from "next/link";

export default function LogInPage() {
  const { user, logIn } = useAuth();
  const [error, setError] = useState('');


  useEffect(() => {
    if (user) {
      redirect('/');
    };
  }, [user]);

  const handleLogIn: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    const values = new FormData(event.currentTarget);
    const email = values.get("email") as string | null;
    const password = values.get("password") as string | null;

    if (!email || !password) {
      return;
    }

    logIn(email, password)
      .then(() => {
        redirect('/');
      })
      .catch((err) => {
        console.error({err});
        setError(err.code);
      });
  }

  return (
    <div>
      <form onSubmit={handleLogIn}>
        <div>
          <label htmlFor="email">Email</label>
          <input type="email" id="email" name="email" required />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input type="password" id="password" name="password" required />
        </div>
        {error && <p className="text-red-500">{error}</p>}

        <button type="submit">Log in</button>
      </form>
    </div>
  )
}