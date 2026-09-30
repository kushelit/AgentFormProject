'use client';
// src/components/commission/summary/SlowLoadHint.tsx
// הסבר שמופיע רק כשהטעינה נמשכת: אחרי טעינה חדשה הנתונים מחושבים מחדש (פעם אחת), ולכן הכניסה הראשונה איטית יותר.
import React, { useEffect, useState } from 'react';

const SlowLoadHint: React.FC<{ afterMs?: number }> = ({ afterMs = 3500 }) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), afterMs);
    return () => clearTimeout(t);
  }, [afterMs]);
  if (!show) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900" role="status">
      <span className="h-5 w-5 shrink-0 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
      <span>
        <b>מחשבים את הסיכום מהנתונים העדכניים.</b> אחרי טעינה חדשה הכניסה הראשונה לוקחת קצת יותר זמן (עד חצי דקה) — הכניסות הבאות יהיו מיידיות.
      </span>
    </div>
  );
};

export default SlowLoadHint;