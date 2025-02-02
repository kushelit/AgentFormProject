'use client';


import { useState } from 'react';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import './ResetPass.css';


export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleResetPassword = async (event: { preventDefault: () => void; }) => {
    event.preventDefault();
    const auth = getAuth();

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('נשלח קישור לאיפוס סיסמא למייל שהגדרת');
      setError('');
    } catch (err) {
      setError('שגיאה בשליחת איפוס סיסמא, נסה שנית.');
      setMessage('');
    }
  };

  return (
    <div className="form-auth">
      <form onSubmit={handleResetPassword} className="auth-form">
        <h2 className="form-title">איפוס סיסמה</h2>
  
        {/* שדה כתובת מייל */}
        <div className="form-group">
          <label htmlFor="email" className="form-label">
            כתובת מייל <span className="required">*</span>
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="form-input"
          />
        </div>
  
        {/* הודעות שגיאה/הצלחה */}
        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
  
        {/* כפתור איפוס סיסמא */}
        <button className="form-button" type="submit">
          שלח סיסמא למייל
        </button>
      </form>
    </div>
  );  
}
