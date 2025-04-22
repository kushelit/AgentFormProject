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
        if  (data.role !== 'agent' && data.role !== 'manager') {
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
    <div className="form-container">
      <form onSubmit={handleSignUp} className="auth-form">
        <h2 className="form-title">רישום עובד</h2>
  
        {/* שם עובד */}
        <div className="form-group">
          <label htmlFor="name" className="form-label">
            שם עובד <span className="required">*</span>
          </label>
          <input type="text" id="name" name="name" required className="form-input" />
        </div>
  
        {/* אימייל */}
        <div className="form-group">
          <label htmlFor="email" className="form-label">
            אימייל <span className="required">*</span>
          </label>
          <input type="email" id="email" name="email" required className="form-input" />
        </div>
  
        {/* סיסמא */}
        <div className="form-group">
          <label htmlFor="password" className="form-label">
            סיסמא <span className="required">*</span>
          </label>
          <input type="password" id="password" name="password" required className="form-input" />
        </div>
  
        {/* אימות סיסמא */}
        <div className="form-group">
          <label htmlFor="password-confirm" className="form-label">
            אימות סיסמא <span className="required">*</span>
          </label>
          <input
            type="password"
            id="password-confirm"
            name="password-confirm"
            required
            className="form-input"
          />
        </div>
  
        {/* כפתור הוספה */}
        <button type="submit" className="form-button">
          הוסף עובד
        </button>
  
        {/* הודעות שגיאה */}
        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );  
}