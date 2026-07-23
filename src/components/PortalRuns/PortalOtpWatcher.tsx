'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import PortalRunOtpModal from '@/components/PortalRunOtpModal';

type Props = {
  db: Firestore;
  agentId: string;
  // אופציונלי: אם רוצים להיצמד רק לריצה שנוצרה במסך הזה
  preferRunId?: string;
};

export default function PortalOtpWatcher({ db, agentId, preferRunId }: Props) {
  const [otpRunId, setOtpRunId] = useState<string>('');

  useEffect(() => {
    if (!agentId) {
      setOtpRunId('');
      return;
    }

    // מביא את הריצה הכי עדכנית של הסוכן שממתינה ל-OTP
    const qy = query(
      collection(db, 'portalImportRuns'),
      where('agentId', '==', String(agentId)),
      where('status', '==', 'otp_required'),
      orderBy('updatedAt', 'desc'),
      limit(1)
    );

    return onSnapshot(qy, (snap) => {
      const doc = snap.docs[0];
      if (!doc) {
        setOtpRunId('');
        return;
      }
const d: any = doc.data();

      // לא בודקים otp.state כאן - זה הופך ל-'required' רק *אחרי* שהמשתמש
      // כבר שלח קוד, מה שיצר מצב "ביצה ותרנגולת" שמנע מהמודאל להופיע שוב
      // בניסיון השני (אחרי קוד שגוי). מסתמכים רק על status, כמו המודאל עצמו.
      const otpMode = String(d?.otp?.mode || d?.['otp.mode'] || 'firestore');
      if (otpMode === 'manual') {
        setOtpRunId('');
        return;
      }

      const id = doc.id;
      setOtpRunId(id);
      
    });
  }, [db, agentId, preferRunId]);

  if (!otpRunId) return null;
  return <PortalRunOtpModal runId={otpRunId} />;
}
