'use client';


import { useState } from 'react';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';

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
      <form onSubmit={handleResetPassword}>
        <div className="content-auth">
          <label htmlFor="email">כתובת מייל
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        {message && <p className="text-green-500">{message}</p>}
        {error && <p className="text-red-500">{error}</p>}
        <button className="button-container" type="submit">
איפוס סיסמא </button>
      </form>
    </div>
  );
}
