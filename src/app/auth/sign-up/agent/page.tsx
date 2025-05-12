'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useEffect, useState } from "react";
import { redirect } from 'next/navigation';
import { db } from "@/lib/firebase/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import './agentSignup.css';


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
        isActive: true,
      });
      redirect('/auth/log-in');
    })
    .catch((err) => {
      console.error({err});
      setError(err.code);
    });
}

return (
  <div className="form-auth-container">
    <form onSubmit={handleSignUp} className="auth-form">
      <h2 className="form-title">יצירת משתמש</h2>

      {/* שם סוכן */}
      <div className="form-group">
        <label htmlFor="name" className="form-label">
          שם הסוכן <span className="required">*</span>
        </label>
        <input type="text" id="name" name="name" required className="form-input" />
      </div>

      {/* כתובת מייל */}
      <div className="form-group">
        <label htmlFor="email" className="form-label">
          כתובת מייל <span className="required">*</span>
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

      {/* כפתור הרשמה */}
      <button type="submit" className="form-button">
        הרשמה
      </button>

      {/* הודעות שגיאה */}
      {error && <p className="error-text">{error}</p>}

      {/* קישור להתחברות */}
      <div className="form-footer">
        <div className="form-footer-line">
          <span>או</span>
        </div>
        <a href="/auth/log-in" className="form-link">
          התחברות
        </a>
      </div>
    </form>
  </div>
);
}
