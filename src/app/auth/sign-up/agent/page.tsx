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
      redirect('/auth/log-in');
    })
    .catch((err) => {
      console.error({err});
      setError(err.code);
    });
}


  return (
    <div className="frame-container bg-custom-white" style={{ maxWidth: '500px', margin: '0 auto', padding: '10px 20px 20px 20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '10px', textAlign: 'center', direction: 'rtl' }}>
      <div style={{ marginTop: '20px', width: '90%', margin: '0 auto', overflowX: 'auto' }}>
        <div className="table-container" style={{ width: '100%' }}>
          <form onSubmit={handleSignUp}>
            <table style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td>
                    <label htmlFor="name">שם סוכן</label>
                  </td>
                  <td>
                    <input type="text" id="name" name="name" required />
                  </td>
                </tr>
                <tr>
                  <td>
                    <label htmlFor="email">אימייל</label>
                  </td>
                  <td>
                    <input type="email" id="email" name="email" required />
                  </td>
                </tr>
                <tr>
                  <td>
                    <label htmlFor="password">סיסמא</label>
                  </td>
                  <td>
                    <input type="password" id="password" name="password" required />
                  </td>
                </tr>
                <tr>
                  <td>
                    <label htmlFor="password-confirm">אימות סיסמא</label>
                  </td>
                  <td>
                    <input type="password" id="password-confirm" name="password-confirm" required />
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="button-group">
              <button type="submit">הרשם</button>
            </div>
          </form>
          {error && <p className="text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}