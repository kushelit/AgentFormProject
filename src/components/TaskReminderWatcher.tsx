'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, where, onSnapshot, updateDoc, doc, getDoc, Timestamp,
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
const POSITION_STORAGE_KEY = 'trw-position';

type Position = { x: number; y: number };

export default function TaskReminderWatcher() {
  const { user } = useAuth();
  const router = useRouter();
  const { canAccess: canUseTaskReminders } = usePermission('access_crm_module');
  const [tasks, setTasks] = useState<WatchedTask[]>([]);
  const [activePopup, setActivePopup] = useState<WatchedTask | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [isLead, setIsLead] = useState(false);
  const [position, setPosition] = useState<Position | null>(null); // null = ברירת מחדל (למעלה במרכז)
  const queueRef = useRef<WatchedTask[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<Position | null>(null);

  // ─── טעינת מיקום שמור (אם המשתמש גרר את התזכורת בעבר) ─────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(POSITION_STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (typeof p?.x === 'number' && typeof p?.y === 'number') setPosition(p);
    } catch {}
  }, []);

  // ─── למי שייכת המשימה המוצגת — לקוח או ליד ────────────────────────────────────
  // משימות של ליד נשמרות ב-customerTasks עם מזהה הליד ב-customerId (עד שהליד מומר ללקוח,
  // ואז ההמרה מעבירה אותן למזהה הלקוח). לכן מחפשים קודם לקוח, ואם אין — ליד.
  useEffect(() => {
    setCustomerName('');
    setIsLead(false);
    const id = activePopup?.customerId;
    if (!id) return;
    let cancelled = false;
    const fullName = (data: any) =>
      `${data.firstNameCustomer ?? ''} ${data.lastNameCustomer ?? ''}`.trim();
    (async () => {
      try {
        const customerSnap = await getDoc(doc(db, 'customer', id));
        if (cancelled) return;
        if (customerSnap.exists()) {
          setCustomerName(fullName(customerSnap.data()));
          return;
        }
      } catch {}
      try {
        const leadSnap = await getDoc(doc(db, 'leads', id));
        if (cancelled || !leadSnap.exists()) return;
        setIsLead(true);
        setCustomerName(fullName(leadSnap.data()));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [activePopup?.id, activePopup?.customerId]);

  // ─── גרירה ─────────────────────────────────────────────────────────────────────
  const clampToViewport = (p: Position): Position => {
    const w = cardRef.current?.offsetWidth ?? 320;
    const h = cardRef.current?.offsetHeight ?? 160;
    return {
      x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - w)),
      y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - h)),
    };
  };

  // אם החלון קטן מאז שנשמר המיקום — מוודאים שהתזכורת לא יוצאת מהמסך
  useEffect(() => {
    if (activePopup && position) setPosition(clampToViewport(position));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePopup?.id]);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffsetRef.current;
    if (!offset) return;
    setPosition(clampToViewport({ x: e.clientX - offset.x, y: e.clientY - offset.y }));
  };

  const onDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffsetRef.current;
    if (!offset) return;
    dragOffsetRef.current = null;
    const p = clampToViewport({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    setPosition(p);
    try { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(p)); } catch {}
  };

  const resetPosition = () => {
    setPosition(null);
    try { localStorage.removeItem(POSITION_STORAGE_KEY); } catch {}
  };

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
    if (t.customerId) router.push(isLead ? `/NewLeads/${t.customerId}` : `/customers/${t.customerId}`);
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
    <div
      className={`trw-overlay${position ? ' trw-overlay--custom' : ''}`}
      style={position ? { left: position.x, top: position.y } : undefined}
    >
      <div className="trw-card" dir="rtl" ref={cardRef}>
        <div
          className="trw-header"
          title="אפשר לגרור את התזכורת למיקום אחר"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <span className="trw-icon">⏰</span>
          <span className="trw-title">תזכורת למשימה</span>
          {position && (
            <button className="trw-btn-reset" onClick={resetPosition} title="החזר למיקום ברירת המחדל">
              ↺
            </button>
          )}
        </div>
        {customerName && (
          <div className="trw-customer">
            👤 {customerName}
            {isLead && <span className="trw-lead-badge">ליד</span>}
          </div>
        )}
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
