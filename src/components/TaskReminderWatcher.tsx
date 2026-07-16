'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, where, onSnapshot, updateDoc, doc, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import './TaskReminderWatcher.css';

type TaskStatus = 'open' | 'in_progress' | 'done';

interface WatchedTask {
  id: string;
  text: string;
  dueDate?: string;
  status: TaskStatus;
  assignedTo: string;
  customerId?: string;
  reminderMinutesBefore?: number;
  reminderShown?: boolean;
  snoozeUntil?: string; // ISO string
}

const CHECK_INTERVAL_MS = 20000; // בודק כל 20 שניות
const DEFAULT_REMINDER_MINUTES = 15;
const SNOOZE_MINUTES = 15;

export default function TaskReminderWatcher() {
  const { user } = useAuth();
  const router = useRouter();
  const { canAccess: canUseTaskReminders } = usePermission('access_crm_module');
  const [tasks, setTasks] = useState<WatchedTask[]>([]);
  const [activePopup, setActivePopup] = useState<WatchedTask | null>(null);
  const queueRef = useRef<WatchedTask[]>([]);

  // ─── האזנה בזמן אמת למשימות פתוחות שהוקצו למשתמש הנוכחי ─────────────────────
  // רק אם למשתמש/לסוכנות יש הרשאה לפיצ'ר הזה — כדי לא להריץ שאילתה לכל משתמשי המערכת
  useEffect(() => {
    if (!user?.uid || !canUseTaskReminders) {
      setTasks([]);
      return;
    }
    const q = query(
      collection(db, 'customerTasks'),
      where('assignedTo', '==', user.uid),
      where('status', 'in', ['open', 'in_progress']),
    );
    const unsub = onSnapshot(q, snap => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [user?.uid, canUseTaskReminders]);

  // ─── בדיקה תקופתית — מי הגיע לזמן התזכורת שלו ────────────────────────────────
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const t of tasks) {
        if (!t.dueDate) continue;
        if (t.reminderShown) continue;

        // דחייה (snooze) פעילה — עדיין לא הגיע הזמן להתריע שוב
        if (t.snoozeUntil && new Date(t.snoozeUntil).getTime() > now) continue;

        const dueMs = new Date(t.dueDate).getTime();
        if (isNaN(dueMs)) continue;
        const minutesBefore = t.reminderMinutesBefore ?? DEFAULT_REMINDER_MINUTES;
        const triggerMs = dueMs - minutesBefore * 60000;

        if (now >= triggerMs) {
          // כבר בתור / כבר מוצג — לא מכפילים
          const alreadyQueued = queueRef.current.some(q => q.id === t.id);
          if (!alreadyQueued && activePopup?.id !== t.id) {
            queueRef.current.push(t);
          }
        }
      }

      if (!activePopup && queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        setActivePopup(next);
      }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tasks, activePopup]);

  // ─── פעולות על הפופ-אפ ────────────────────────────────────────────────────────
  const closePopup = () => {
    setActivePopup(null);
  };

  const dismissForever = async (t: WatchedTask) => {
    try {
      await updateDoc(doc(db, 'customerTasks', t.id), { reminderShown: true });
    } finally {
      closePopup();
    }
  };

  const snooze = async (t: WatchedTask) => {
    const snoozeUntil = new Date(Date.now() + SNOOZE_MINUTES * 60000).toISOString();
    try {
      await updateDoc(doc(db, 'customerTasks', t.id), { snoozeUntil });
    } finally {
      closePopup();
    }
  };

  const goToTask = async (t: WatchedTask) => {
    await dismissForever(t);
    if (t.customerId) router.push(`/customers/${t.customerId}`);
  };

  const formatDue = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) +
      ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  if (!canUseTaskReminders) return null;
  if (!activePopup) return null;

  return (
    <div className="trw-overlay">
      <div className="trw-card" dir="rtl">
        <div className="trw-header">
          <span className="trw-icon">⏰</span>
          <span className="trw-title">תזכורת למשימה</span>
        </div>
        <div className="trw-text">{activePopup.text}</div>
        {activePopup.dueDate && (
          <div className="trw-due">מועד יעד: {formatDue(activePopup.dueDate)}</div>
        )}
        <div className="trw-actions">
          <button className="trw-btn-primary" onClick={() => goToTask(activePopup)}>
            עבור למשימה
          </button>
          <button className="trw-btn-snooze" onClick={() => snooze(activePopup)}>
            דחה ב-15 דקות
          </button>
          <button className="trw-btn-dismiss" onClick={() => dismissForever(activePopup)}>
            הבנתי, סגור
          </button>
        </div>
      </div>
    </div>
  );
}
