'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useEffect, useState } from "react";
import { redirect } from 'next/navigation';
import './LogIn.css';
import Link from 'next/link';

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
    <div className="login-container">
      <div className="login-card">
        {/* כותרת */}
        <h1 className="form-title">התחברות</h1>
  
        {/* טופס */}
        <form onSubmit={handleLogIn} className="login-form">
          {/* כתובת מייל */}
          <div className="form-group">
            <label htmlFor="email" className="form-label">כתובת מייל</label>
            <input type="email" id="email" name="email" required className="form-input" />
          </div>
  
          {/* סיסמא */}
          <div className="form-group">
            <label htmlFor="password" className="form-label">סיסמא</label>
            <input type="password" id="password" name="password" required className="form-input" />
          </div>
  
          {/* שכחת סיסמא */}
          <div className="forgot-password-container">
            <Link href="/auth/reset-password" className="forgot-password-link">שכחת סיסמא?</Link>
          </div>
  
          {/* הודעות שגיאה */}
          {error && <p className="error-text">{error}</p>}
  
          {/* כפתור כניסה */}
          <button className="login-button" type="submit">כניסה</button>
        </form>
      </div>
    </div>
  );  
}