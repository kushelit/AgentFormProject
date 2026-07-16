'use client';

import { useEffect, useState } from 'react';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';

type TaskStatus = 'open' | 'in_progress' | 'done';

interface Task {
  id: string;
  text: string;
  dueDate?: string;
  assignedTo: string;
  assignedToName: string;
  status: TaskStatus;
  createdBy?: string;
  createdAt: any;
  reminderMinutesBefore?: number;
  reminderShown?: boolean;
  snoozeUntil?: string;
}

interface AgentUser {
  id: string;
  displayName?: string;
  email?: string;
  name?: string;
}

interface Props {
  customerId: string;
  agentId: string;
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'פתוחה',
  in_progress: 'בתהליך',
  done: 'הושלם',
};

const STATUS_CLASS: Record<TaskStatus, string> = {
  open: 'ct-badge-open',
  in_progress: 'ct-badge-progress',
  done: 'ct-badge-done',
};

export default function CustomerTasks({ customerId, agentId }: Props) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AgentUser[]>([]);

  // טופס הוספה
  const [newText, setNewText] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newAssigned, setNewAssigned] = useState('');
  const [newReminder, setNewReminder] = useState(15);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // ─── עריכה ───────────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editAssigned, setEditAssigned] = useState('');
  const [editReminder, setEditReminder] = useState(15);
  const [editSaving, setEditSaving] = useState(false);

  // ─── מחיקה ───────────────────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // שליפת משתמשי הסוכנות
  useEffect(() => {
    const load = async () => {
      const q = query(
  collection(db, 'users'),
  where('agentId', '==', agentId),
  where('isActive', '==', true),
);
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setUsers(list);
      // ברירת מחדל — המשתמש הנוכחי
      if (user && !newAssigned) {
        const me = list.find(u => u.id === user.uid);
        if (me) setNewAssigned(me.id);
      }
    };
    if (agentId) load();
  }, [agentId]);

const loadTasks = async () => {
  setLoading(true);
  try {
    const q = query(
      collection(db, 'customerTasks'),
      where('customerId', '==', customerId),
      where('agentId', '==', agentId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    const raw: Task[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const sorted = [...raw].sort((a, b) => {
      // הושלם — תמיד למטה
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      // שניהם פתוחים — לפי תאריך יעד (ללא תאריך = אחרון)
      if (!aDone && !bDone) {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }

      // שניהם הושלמו — לפי createdAt יורד (כמו שהיה)
      return 0;
    });

    setTasks(sorted);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => { loadTasks(); }, [customerId]);

  const getUserName = (uid: string) => {
    const u = users.find(x => x.id === uid);
    return u?.name || u?.displayName || u?.email || uid;
  };

  const addTask = async () => {
    if (!newText.trim() || !user) return;
    setSaving(true);
    try {
      const assignedUser = users.find(u => u.id === newAssigned);
      await addDoc(collection(db, 'customerTasks'), {
        customerId,
        agentId,
        text: newText.trim(),
        dueDate: newDue || null,
        assignedTo: newAssigned || user.uid,
        assignedToName: assignedUser?.name || assignedUser?.displayName || assignedUser?.email || '',
        status: 'open' as TaskStatus,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        reminderMinutesBefore: newReminder || 15,
        reminderShown: false,
        snoozeUntil: null,
      });
      setNewText('');
      setNewDue('');
      setNewReminder(15);
      setShowForm(false);
      await loadTasks();
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (taskId: string) => {
    await updateDoc(doc(db, 'customerTasks', taskId), { status: 'done' });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' } : t));
  };

  const changeStatus = async (taskId: string, status: TaskStatus) => {
    await updateDoc(doc(db, 'customerTasks', taskId), { status });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
  };

  // ─── עריכת משימה ─────────────────────────────────────────────────────────────
  const startEdit = (t: Task) => {
    setEditingId(t.id);
    setEditText(t.text);
    setEditDue(t.dueDate || '');
    setEditAssigned(t.assignedTo || '');
    setEditReminder(t.reminderMinutesBefore ?? 15);
    setConfirmDeleteId(null); // סגור אישור מחיקה אם פתוח
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
    setEditDue('');
    setEditAssigned('');
  };

  const saveTaskEdit = async () => {
    if (!editingId || !editText.trim()) return;
    setEditSaving(true);
    try {
      const assignedUser = users.find(u => u.id === editAssigned);
      const assignedToName = assignedUser?.name || assignedUser?.displayName || assignedUser?.email || '';
      const original = tasks.find(t => t.id === editingId);
      const dueChanged = (original?.dueDate || '') !== (editDue || '');
      const reminderChanged = (original?.reminderMinutesBefore ?? 15) !== (editReminder || 0);
      await updateDoc(doc(db, 'customerTasks', editingId), {
        text: editText.trim(),
        dueDate: editDue || null,
        assignedTo: editAssigned || '',
        assignedToName,
        reminderMinutesBefore: editReminder || 15,
        // אם תאריך היעד או ערך התזכורת השתנו — מאפסים כדי שהתזכורת תיבדק מחדש
        ...(dueChanged || reminderChanged ? { reminderShown: false, snoozeUntil: null } : {}),
      });
      setTasks(prev => prev.map(t => t.id === editingId ? {
        ...t,
        text: editText.trim(),
        dueDate: editDue || undefined,
        assignedTo: editAssigned,
        assignedToName,
        reminderMinutesBefore: editReminder || 15,
        ...(dueChanged || reminderChanged ? { reminderShown: false, snoozeUntil: undefined } : {}),
      } : t));
      cancelEdit();
    } finally {
      setEditSaving(false);
    }
  };

  // ─── מחיקת משימה ─────────────────────────────────────────────────────────────
  const deleteTask = async (taskId: string) => {
    await deleteDoc(doc(db, 'customerTasks', taskId));
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setConfirmDeleteId(null);
  };

  // הערה: createdBy נשמר לצורכי מעקב/היסטוריה בלבד — ההרשאה לעריכה/מחיקה פתוחה לכל חבר צוות

  const isOverdue = (t: Task) => {
    if (t.status === 'done' || !t.dueDate) return false;
    return new Date(t.dueDate) < new Date();
  };

  const formatDate = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="ct-wrap">
      {/* ── כותרת + כפתור הוסף ── */}
      <div className="ct-header">
        <span className="ct-title">משימות ({tasks.filter(t => t.status !== 'done').length} פתוחות)</span>
        <button className="ct-btn-new" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'בטל' : '+ משימה חדשה'}
        </button>
      </div>

      {/* ── טופס הוספה ── */}
      {showForm && (
        <div className="ct-form">
          <input
            className="ct-input"
            placeholder="תיאור המשימה"
            value={newText}
            onChange={e => setNewText(e.target.value)}
          />
          <div className="ct-form-row">
            <div className="ct-form-field">
              <label className="ct-label">תאריך יעד</label>
              <input
                type="datetime-local"
                className="ct-input"
                value={newDue}
                onChange={e => setNewDue(e.target.value)}
              />
            </div>
            <div className="ct-form-field">
              <label className="ct-label">אחראי</label>
              <select
                className="ct-input"
                value={newAssigned}
                onChange={e => setNewAssigned(e.target.value)}
              >
                <option value="">בחר אחראי</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.displayName || u.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="ct-form-field">
              <label className="ct-label">תזכורת (דקות לפני)</label>
              <input
                type="number"
                min={0}
                className="ct-input"
                value={newReminder}
                onChange={e => setNewReminder(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="ct-form-actions">
            <button className="ct-btn-save" onClick={addTask} disabled={!newText.trim() || saving}>
              {saving ? 'שומר...' : 'הוסף משימה'}
            </button>
            <button className="ct-btn-cancel" onClick={() => setShowForm(false)}>בטל</button>
          </div>
        </div>
      )}

      {/* ── רשימת משימות ── */}
      {loading ? (
        <div className="cp-loading-inline">טוען...</div>
      ) : tasks.length === 0 ? (
        <div className="cp-empty">אין משימות עדיין</div>
      ) : (
        <div className="ct-list">
          {tasks.map(t => (
            editingId === t.id ? (
              // ── מצב עריכה — טופס inline באותה שורה ──
              <div key={t.id} className="ct-form">
                <input
                  className="ct-input"
                  placeholder="תיאור המשימה"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  autoFocus
                />
                <div className="ct-form-row">
                  <div className="ct-form-field">
                    <label className="ct-label">תאריך יעד</label>
                    <input
                      type="datetime-local"
                      className="ct-input"
                      value={editDue}
                      onChange={e => setEditDue(e.target.value)}
                    />
                  </div>
                  <div className="ct-form-field">
                    <label className="ct-label">אחראי</label>
                    <select
                      className="ct-input"
                      value={editAssigned}
                      onChange={e => setEditAssigned(e.target.value)}
                    >
                      <option value="">בחר אחראי</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.displayName || u.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ct-form-field">
                    <label className="ct-label">תזכורת (דקות לפני)</label>
                    <input
                      type="number"
                      min={0}
                      className="ct-input"
                      value={editReminder}
                      onChange={e => setEditReminder(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="ct-form-actions">
                  <button
                    className="ct-btn-save"
                    onClick={saveTaskEdit}
                    disabled={!editText.trim() || editSaving}
                  >
                    {editSaving ? 'שומר...' : 'שמור'}
                  </button>
                  <button className="ct-btn-cancel" onClick={cancelEdit}>בטל</button>
                </div>
              </div>
            ) : (
              // ── מצב תצוגה רגיל ──
              <div
                key={t.id}
                className={`ct-task${t.status === 'done' ? ' ct-task-done' : ''}${isOverdue(t) ? ' ct-task-overdue' : ''}`}
              >
                {/* כפתור השלמה בקליק */}
                <button
                  className={`ct-check${t.status === 'done' ? ' ct-check-done' : ''}`}
                  onClick={() => t.status !== 'done' && markDone(t.id)}
                  title={t.status === 'done' ? 'הושלם' : 'סמן כהושלם'}
                >
                  {t.status === 'done' ? '✓' : ''}
                </button>

                <div className="ct-task-body">
                  <div className="ct-task-text">{t.text}</div>
                  <div className="ct-task-meta">
                    {t.dueDate && (
                      <span className={`ct-due${isOverdue(t) ? ' ct-due-late' : ''}`}>
                        📅 {formatDate(t.dueDate)}
                      </span>
                    )}
                    {t.assignedToName && (
                      <span className="ct-assigned">👤 {t.assignedToName}</span>
                    )}
                  </div>
                </div>

                {/* ── כפתורי ערוך / מחק (פתוח לכל חבר צוות) ── */}
                <div className="cn-note-actions">
                    <button
                      className="cn-btn-icon"
                      title="ערוך משימה"
                      onClick={() => startEdit(t)}
                    >
                      ✏️
                    </button>
                    {confirmDeleteId === t.id ? (
                      <>
                        <span className="cn-confirm-text">למחוק?</span>
                        <button
                          className="cn-btn-icon cn-btn-danger"
                          onClick={() => deleteTask(t.id)}
                        >
                          כן
                        </button>
                        <button
                          className="cn-btn-icon"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          לא
                        </button>
                      </>
                    ) : (
                      <button
                        className="cn-btn-icon cn-btn-danger"
                        title="מחק משימה"
                        onClick={() => setConfirmDeleteId(t.id)}
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                {/* שינוי סטטוס */}
                <select
                  className={`ct-status-select ${STATUS_CLASS[t.status]}`}
                  value={t.status}
                  onChange={e => changeStatus(t.id, e.target.value as TaskStatus)}
                >
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}
