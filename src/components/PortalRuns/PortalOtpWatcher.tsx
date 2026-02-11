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

      // חייב להיות required
      if (String(d?.otp?.state || '') !== 'required') {
        setOtpRunId('');
        return;
      }

      // אם נתנו preferRunId (הריצה שנוצרה במסך הזה) – נעדיף אותה
      // ואם יש mismatch, עדיין נציג (כדי לא להיתקע), אבל את יכולה לבחור להחמיר.
      const id = doc.id;

      // אם את רוצה להציג רק את preferRunId – החליפי לזה:
      // if (preferRunId && id !== preferRunId) { setOtpRunId(''); return; }

      setOtpRunId(id);
    });
  }, [db, agentId, preferRunId]);

  if (!otpRunId) return null;
  return <PortalRunOtpModal runId={otpRunId} />;
}
