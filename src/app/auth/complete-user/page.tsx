'use client';

import { useAuth } from "@/app/AuthContext";
import { FormEventHandler, useEffect, useState } from "react";
import { redirect } from 'next/navigation';

export default function LogInPage() {
  const { user } = useAuth();
  const [error, setError] = useState('');


  useEffect(() => {
    if (!user) {
        redirect('/auth/login');
    }

    if (user.displayName) {
        redirect('/');
    };
  }, [user]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="display-name">Name</label>
        <input type="text" id="display-name" name="display-name" required />
      </div>
      {error && <p className="text-red-500">{error}</p>}

      <button type="submit">Log in</button>
    </form>
  )
}