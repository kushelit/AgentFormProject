// ✅ WorkerSignUpPage.tsx – מעודכן עם מגבלת עובדים רק לסוכנים עם subscriptionId

'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useEffect, useState } from "react";
import { redirect, notFound } from 'next/navigation';
import { db } from "@/lib/firebase/firebase";
import { collection, doc, setDoc, getDoc, query, where, getDocs } from "firebase/firestore";
import './agentSignupWorker.css';

export default function WorkerSignUpPage({ params }: { params: { agentId: string } }) {
  const { user, signUp } = useAuth();
  const [error, setError] = useState('');
  const [agent, setAgent] = useState<any>(null); // נטען גם את addOns
  const [workerStats, setWorkerStats] = useState<{ totalAllowed: number; current: number } | null>(null);

  useEffect(() => {
    const fetchAgentAndWorkers = async () => {
      const docRef = doc(db, 'users', params.agentId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return notFound();
      const data = snapshot.data();
      if (data.role !== 'agent' && data.role !== 'manager') return notFound();
      setAgent(data);

      // אם אין לו מנוי – אין מגבלה
      if (!data.subscriptionId) return;

      const q = query(collection(db, 'users'), where('agentId', '==', params.agentId), where('role', '==', 'worker'));
      const workersSnapshot = await getDocs(q);
      const existingWorkers = workersSnapshot.docs.filter(doc => doc.data().isActive !== false);

      const baseLimit = data.subscriptionType === 'pro' ? 2 : 0;
      const extra = data.addOns?.extraWorkers || 0;
      const totalAllowed = baseLimit + extra;

      setWorkerStats({ totalAllowed, current: existingWorkers.length });
    };
    fetchAgentAndWorkers();
  }, [params.agentId]);

  const handleSignUp: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setError('');

    if (!agent) return;

    if (agent.subscriptionId && workerStats && workerStats.current >= workerStats.totalAllowed) {
      setError('חרגת מהמכסה המותרת של עובדים במנוי שלך. לשדרוג פנה אלינו.');
      return;
    }

    const values = new FormData(event.currentTarget);
    const name = values.get("name") as string | null;
    const email = values.get("email") as string | null;
    const password = values.get("password") as string | null;
    const confirmPassword = values.get("password-confirm") as string | null;

    if (!email || !password || !name || !confirmPassword) {
      setError('נא למלא את כל השדות');
      return;
    }

    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    try {
      const userCredential = await signUp(email, password);
      const docRef = doc(db, 'users', userCredential.user.uid);
      await setDoc(docRef, {
        name,
        email,
        role: 'worker',
        agentId: params.agentId,
        isActive: true,
      });
      redirect('/');
    } catch (err: any) {
      console.error({ err });
      setError(err.code || 'שגיאה בעת רישום עובד');
    }
  };

  if (!agent) return <div>Loading...</div>;

  return (
    <div className="form-container">
      <form onSubmit={handleSignUp} className="auth-form">
        <h2 className="form-title">רישום עובד</h2>

        {agent.subscriptionId && workerStats && (
          <div className="info-text mb-4 text-sm text-gray-700">
            עובדים פעילים: {workerStats.current} מתוך {workerStats.totalAllowed} המותרים במנוי
          </div>
        )}

        <div className="form-group">
          <label htmlFor="name" className="form-label">שם עובד <span className="required">*</span></label>
          <input type="text" id="name" name="name" required className="form-input" />
        </div>

        <div className="form-group">
          <label htmlFor="email" className="form-label">אימייל <span className="required">*</span></label>
          <input type="email" id="email" name="email" required className="form-input" />
        </div>

        <div className="form-group">
          <label htmlFor="password" className="form-label">סיסמא <span className="required">*</span></label>
          <input type="password" id="password" name="password" required className="form-input" />
        </div>

        <div className="form-group">
          <label htmlFor="password-confirm" className="form-label">אימות סיסמא <span className="required">*</span></label>
          <input type="password" id="password-confirm" name="password-confirm" required className="form-input" />
        </div>

        <button type="submit" className="form-button">הוסף עובד</button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}
