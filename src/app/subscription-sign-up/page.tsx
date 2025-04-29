'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios'; // חשוב: מותקן במערכת שלך

export default function SubscriptionSignUpPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const fullName = values.get("fullName") as string | null;
    const email = values.get("email") as string | null;
    const phone = values.get("phone") as string | null;

    if (!fullName || !email || !phone) {
      setError('אנא מלא/י את כל השדות');
      return;
    }

    try {
      // קריאה לשרת שלך שמכין בקשת תשלום מול Grow
      const response = await axios.post('/api/create-subscription', {
        fullName,
        email,
        phone,
      });

      const paymentUrl = response.data?.paymentUrl;
      if (paymentUrl) {
        router.push(paymentUrl); // מפנה את המשתמש לעמוד התשלום
      } else {
        setError('שגיאה ביצירת תשלום');
      }
    } catch (err) {
      console.error(err);
      setError('שגיאה בתהליך התשלום');
    }
  };

  return (
    <div className="form-auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2 className="form-title">הרשמה למנוי</h2>

        <div className="form-group">
          <label htmlFor="fullName" className="form-label">
            שם מלא <span className="required">*</span>
          </label>
          <input type="text" id="fullName" name="fullName" required className="form-input" />
        </div>

        <div className="form-group">
          <label htmlFor="email" className="form-label">
            אימייל <span className="required">*</span>
          </label>
          <input type="email" id="email" name="email" required className="form-input" />
        </div>

        <div className="form-group">
          <label htmlFor="phone" className="form-label">
            טלפון <span className="required">*</span>
          </label>
          <input type="tel" id="phone" name="phone" required className="form-input" />
        </div>

        <button type="submit" className="form-button">
          המשך לתשלום
        </button>

        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}
