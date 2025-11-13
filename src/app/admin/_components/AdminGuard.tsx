'use client';

import React from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';

type Props = { children: React.ReactNode };

export default function AdminGuard({ children }: Props) {
  const { detail } = useAuth(); // מתוך AuthContext שלך

  // אם אין detail עדיין – נניח שלא טען או משתמש לא מחובר
  if (!detail) {
    return (
      <div dir="rtl" className="max-w-xl mx-auto mt-10 p-4 border rounded bg-yellow-50 text-yellow-800">
        מתחבר...
      </div>
    );
  }

  // בדיקת הרשאה
  if (detail.role !== 'admin') {
    return (
      <div dir="rtl" className="max-w-xl mx-auto mt-10 p-4 border rounded bg-red-50 text-red-800">
        ⚠️ אין לך הרשאה לעמוד זה.  
        רק משתמשים עם הרשאת <strong>Admin</strong> יכולים לגשת.
      </div>
    );
  }

  // אחרת – הצג את התוכן
  return <>{children}</>;
}
