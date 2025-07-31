'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useEffect, useState } from "react";
import { db } from "@/lib/firebase/firebase";
import { collection, doc, setDoc, getDoc, query, where, getDocs } from "firebase/firestore";
import { useRouter } from 'next/navigation';
import { notFound } from 'next/navigation';
import { useToast } from "@/hooks/useToast";
import { ToastNotification } from '@/components/ToastNotification';

export default function WorkerSignUpPage({ params }: { params: { agentId: string } }) {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [agent, setAgent] = useState<any>(null);
  const [workerStats, setWorkerStats] = useState<{ totalAllowed: number; current: number } | null>(null);
  const router = useRouter();
  const { toasts, addToast, setToasts } = useToast();

  useEffect(() => {
    const fetchAgentAndWorkers = async () => {
      const docRef = doc(db, 'users', params.agentId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return notFound();
      const data = snapshot.data();
      if (data.role !== 'agent' && data.role !== 'manager') return notFound();
      setAgent(data);

      if (!data.subscriptionId) return;

      const q = query(
        collection(db, 'users'),
        where('agentId', '==', params.agentId),
        where('role', '==', 'worker')
      );
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

    if (!name || !email) {
      setError('נא למלא את כל השדות');
      return;
    }

    try {
      const res = await fetch('/api/reviveWorker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          agentId: params.agentId,
          subscriptionId: agent.subscriptionId || null,
          subscriptionType: agent.subscriptionType || null,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'שגיאה בעת יצירת העובד');
        addToast("error", result.error || 'שגיאה בעת יצירת העובד');
        return;
      }

      addToast("success", `העובד ${name} נוסף בהצלחה!`);
      router.back();
    } catch (err: any) {
      console.error("שגיאה בעת שליחת הבקשה ל-reviveWorker:", err);
      setError('שגיאה לא צפויה בעת רישום עובד');
      addToast("error", 'שגיאה לא צפויה בעת רישום עובד');
    }
  };

  if (!agent) return <div className="text-center py-10 text-gray-600">טוען נתוני סוכן...</div>;

  return (
    <>
      <form onSubmit={handleSignUp} className="space-y-4 max-w-md w-full mx-auto p-6 bg-white rounded shadow mt-10">
        <h2 className="text-2xl font-bold text-center text-blue-900">רישום עובד</h2>

        {agent.subscriptionId && workerStats && (
          <div className="text-sm text-gray-700 text-center mb-4">
            עובדים פעילים: {workerStats.current} מתוך {workerStats.totalAllowed}
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium">שם עובד <span className="text-red-500">*</span></label>
          <input type="text" id="name" name="name" required className="w-full border border-gray-300 rounded px-3 py-2" />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium">אימייל <span className="text-red-500">*</span></label>
          <input type="email" id="email" name="email" required className="w-full border border-gray-300 rounded px-3 py-2" />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" className="w-full bg-blue-900 text-white py-2 rounded hover:bg-blue-800">הוסף עובד</button>
      </form>

      {/* ✅ טוסטים – תמיד מחוץ לטופס */}
      {toasts.map((toast) => (
        <ToastNotification
          key={toast.id}
          type={toast.type}
          className={toast.isHiding ? "hide" : ""}
          message={toast.message}
          onClose={() =>
            setToasts((prevToasts) =>
              prevToasts.filter((t) => t.id !== toast.id)
            )
          }
        />
      ))}
    </>
  );
}
