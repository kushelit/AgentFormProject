'use client';

import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useEffect, useState } from "react";
import { db } from "@/lib/firebase/firebase";
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { useRouter } from 'next/navigation';
import { notFound } from 'next/navigation';
import { useToast } from "@/hooks/useToast";
import { ToastNotification } from '@/components/ToastNotification';

type WorkerStats = { totalAllowed: number; current: number };

export default function WorkerSignUpPage({ params }: { params: { agentId: string } }) {
  const { user } = useAuth(); // (לא חובה פה אבל משאירה כמו אצלך)
  const [error, setError] = useState('');
  const [agent, setAgent] = useState<any>(null);
  const [workerStats, setWorkerStats] = useState<WorkerStats | null>(null);
  const [loadingLimits, setLoadingLimits] = useState<boolean>(true);

  const router = useRouter();
  const { toasts, addToast, setToasts } = useToast();

  useEffect(() => {
    const fetchAgentAndWorkers = async () => {
      setLoadingLimits(true);

      const docRef = doc(db, 'users', params.agentId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return notFound();

      const data = snapshot.data();
      if (data.role !== 'agent' && data.role !== 'manager') return notFound();
      setAgent(data);

      // אם אין מנוי פעיל – מבחינת עובדים: לא מאפשרים (אפשר לשנות מדיניות לפי מה שאת רוצה)
      if (!data.subscriptionId || !data.subscriptionType) {
        setWorkerStats(null);
        setLoadingLimits(false);
        return;
      }

      // 1) ספירת עובדים פעילים
      const q = query(
        collection(db, 'users'),
        where('agentId', '==', params.agentId),
        where('role', '==', 'worker')
      );
      const workersSnapshot = await getDocs(q);
      const existingWorkers = workersSnapshot.docs.filter(d => d.data().isActive !== false);

      // 2) קריאת התוכנית מ-DB כדי לקבל maxUsers
      const planDocRef = doc(db, 'subscriptions_permissions', data.subscriptionType);
      const planSnap = await getDoc(planDocRef);

      const maxUsers = planSnap.exists()
        ? Number(planSnap.data()?.maxUsers ?? 1)
        : 1;

      // maxUsers כולל את הסוכן עצמו → עובדים בסיסי = maxUsers - 1
      const baseWorkersLimit = Math.max(0, maxUsers - 1);

      // תוספת עובדים
      const extraWorkers = Number(data.addOns?.extraWorkers ?? 0);

      const totalAllowed = baseWorkersLimit + extraWorkers;

      setWorkerStats({ totalAllowed, current: existingWorkers.length });
      setLoadingLimits(false);
    };

    fetchAgentAndWorkers();
  }, [params.agentId]);

  const handleSignUp: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setError('');
  
    if (!agent) return;
  
    // ✅ חסימה UX: אם יש מנוי והלימיט עדיין נטען – לא מאפשרים submit
    if (agent.subscriptionId && agent.subscriptionType && loadingLimits) {
      setError('טוען נתוני מכסה... נסי שוב בעוד רגע');
      return;
    }
  
    // ✅ אם יש מנוי פעיל: לא מאפשרים לעבור לוגית בלי workerStats
    if (agent.subscriptionId && agent.subscriptionType && !workerStats) {
      setError('לא ניתן לאמת מכסה לעובדים. נסי שוב או פני לתמיכה.');
      return;
    }
  
    if (agent.subscriptionId && workerStats && workerStats.current >= workerStats.totalAllowed) {
      setError('חרגת מהמכסה המותרת של עובדים במנוי שלך. לשדרוג פנה אלינו.');
      addToast("error", 'חרגת מהמכסה המותרת של עובדים במנוי שלך. לשדרוג פנה אלינו.');
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
      // ✅ 1) מביאים Firebase ID Token של המשתמש המחובר
      const token = await user?.getIdToken();
      if (!token) {
        setError('לא ניתן לאמת משתמש');
        addToast("error", 'לא ניתן לאמת משתמש');
        return;
      }
  
      // ✅ 2) שולחים לשרת עם Authorization
      const res = await fetch('/api/reviveWorker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          email,
          agentId: params.agentId,
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
    } catch {
      setError('שגיאה לא צפויה בעת רישום עובד');
      addToast("error", 'שגיאה לא צפויה בעת רישום עובד');
    }
  };
  
  if (!agent) return <div className="text-center py-10 text-gray-600">טוען נתוני סוכן...</div>;

  const showStats = Boolean(agent.subscriptionId && agent.subscriptionType);

  return (
    <>
      <form onSubmit={handleSignUp} className="space-y-4 max-w-md w-full mx-auto p-6 bg-white rounded shadow mt-10">
        <h2 className="text-2xl font-bold text-center text-blue-900">רישום עובד</h2>

        {showStats && (
          <div className="text-sm text-gray-700 text-center mb-4">
            {loadingLimits ? (
              <>טוען מכסה...</>
            ) : workerStats ? (
              <>עובדים פעילים: {workerStats.current} מתוך {workerStats.totalAllowed}</>
            ) : (
              <>לא ניתן לטעון מכסה</>
            )}
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

        <button
          type="submit"
          disabled={showStats && loadingLimits}
          className="w-full bg-blue-900 text-white py-2 rounded hover:bg-blue-800 disabled:opacity-60"
        >
          הוסף עובד
        </button>
      </form>

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
