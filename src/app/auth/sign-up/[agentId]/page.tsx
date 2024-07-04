'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useEffect, useMemo, useState } from "react";
import { redirect, notFound } from 'next/navigation';
import { db } from "@/lib/firebase/firebase";
import { collection, doc, setDoc, getDoc } from "firebase/firestore";
import './agentSignupWorker.css';



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
      console.log('Error set:', 'Please fill in all fields');  // Add this to check

      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      console.log('Mismatch error set');
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

<div className="frame-container bg-custom-white " style={{ maxWidth: '500px', margin: '0 auto', padding: '10px 20px 20px 20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '10px' ,textAlign: 'center', direction: 'rtl'  }}>
{/*<h1 style={{ paddingTop: '4rem', fontSize: '24px' }}>רישום עובד עבור סוכן <span className="font-bold">{agent.name}</span></h1>*/}
<div style={{ marginTop: '20px', width: '90%', margin: '0 auto', overflowX: 'auto' }}>
<div className="table-container" style={{ width: '100%' }}>

        <form onSubmit={handleSignUp}>
        <table style={{ width: '100%'  }}>
          <tbody>
          <tr>
                    <td>
                    <label htmlFor="name">שם עובד</label>
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
                    <label htmlFor="password-confirm"> אימות סיסמא</label>
                    </td>
                    <td>
                    <input type="password" id="password-confirm" name="password-confirm" required />
                    </td>
            </tr>
            </tbody>
           
            </table>

      <div className="button-group" >
      <button type="submit">הוסף עובד</button>
      </div>
      </form>
      {/* Error message displayed here, outside the form but inside the overall container */}
      {error && <p className="text-red-500">{error}</p>}
      
    </div>
    </div>
    
    </div>
  )

}