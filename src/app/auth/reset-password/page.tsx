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
    <form
    onSubmit={handleResetPassword}
    className="space-y-4 max-w-md w-full mx-auto p-6 bg-white rounded shadow mt-10"
  >
    <h2 className="text-2xl font-bold text-center text-blue-900">איפוס סיסמה</h2>
  
    <div>
      <label htmlFor="email" className="block text-sm font-medium">
        כתובת מייל <span className="text-red-500">*</span>
      </label>
      <input
        type="email"
        id="email"
        name="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="w-full border border-gray-300 rounded px-3 py-2"
      />
    </div>
  
    {message && <p className="text-green-600 text-sm">{message}</p>}
    {error && <p className="text-red-600 text-sm">{error}</p>}
  
    <button
      type="submit"
      className="w-full bg-blue-900 text-white py-2 rounded hover:bg-blue-800"
    >
      שלח סיסמא למייל
    </button>
  </form>
   );  
}
