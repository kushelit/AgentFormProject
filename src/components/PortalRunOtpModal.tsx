'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import DialogNotification from '@/components/DialogNotification';

type Props = {
  runId: string;
  onClose?: () => void;
};

export default function PortalRunOtpModal({ runId, onClose }: Props) {
  const [status, setStatus] = useState<string>('');
  const [step, setStep] = useState<string>('');
  const [monthLabel, setMonthLabel] = useState<string>('');

  const [otpState, setOtpState] = useState<string>('');
  const [otpMode, setOtpMode] = useState<string>('firestore'); // 🔐 firestore | manual
  const [otpHint, setOtpHint] = useState<string>('');

  const [otpValue, setOtpValue] = useState<string>('');
  const [sending, setSending] = useState(false);

  // 🔄 האזנה ל-run
  useEffect(() => {
    if (!runId) return;

    const ref = doc(db, 'portalImportRuns', runId);

    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;

      const d: any = snap.data();

      setStatus(String(d.status || ''));
      setStep(String(d.step || ''));
      setMonthLabel(String(d.monthLabel || ''));

      setOtpState(String(d?.otp?.state || ''));
      setOtpMode(String(d?.otp?.mode || 'firestore').toLowerCase());
      setOtpHint(String(d?.otp?.hint || ''));
    });
  }, [runId]);

  /**
   * ✅ מציגים מודאל רק אם:
   * 1. status === otp_required
   * 2. mode !== manual
   *
   * לא תלוי יותר ב-otp.state כדי למנוע באגים עתידיים.
   */
  const shouldShow = useMemo(() => {
    return status === 'otp_required' && otpMode !== 'manual';
  }, [status, otpMode]);

  if (!runId || !shouldShow) return null;

  const submit = async () => {
    const code = otpValue.trim();
    if (!code) return;

    setSending(true);

    try {
      await updateDoc(doc(db, 'portalImportRuns', runId), {
        'otp.state': 'required',
        'otp.value': code,
        'otp.mode': otpMode,
        updatedAt: serverTimestamp(),
      });

      setOtpValue('');
      onClose?.();
    } finally {
      setSending(false);
    }
  };

  return (
    <DialogNotification
      type="info"
      title="נדרש קוד אימות (OTP)"
      message={
        <div className="text-right">
          <div className="mb-2 text-sm text-gray-700">
            {monthLabel && (
              <div>
                חודש: <b>{monthLabel}</b>
              </div>
            )}

            {step && (
              <div className="mt-1">
                שלב: <b>{step}</b>
              </div>
            )}

            {otpHint && (
              <div className="mt-1 text-xs text-gray-500">
                {otpHint}
              </div>
            )}
          </div>

          <div className="mt-3">
            <label className="block font-semibold mb-1">
              הקלידי את הקוד שקיבלת:
            </label>

            <input
              className="select-input w-full"
              value={otpValue}
              onChange={(e) => setOtpValue(e.target.value)}
              inputMode="numeric"
              placeholder="לדוגמה: 123456"
            />
          </div>

          <div className="text-xs text-gray-500 mt-2">
            אחרי שליחה הריצה תמשיך אוטומטית.
          </div>
        </div>
      }
      onConfirm={submit}
      onCancel={onClose || (() => {})}
      confirmText={sending ? 'שולח...' : 'שלח קוד'}
      cancelText="סגור"
      hideCancel={false}
    />
  );
}
