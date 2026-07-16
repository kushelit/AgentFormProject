'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';
import './TasksHub.css';

// ─── טיפוסים ──────────────────────────────────────────────────────────────────

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
  customerId: string;
  customerName?: string;
  agentId: string;
}

interface AgentUser {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
  isActive?: boolean;
}

interface CustomerOption {
  id: string;
  name: string;
  IDCustomer: string;
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'פתוחה',
  in_progress: 'בתהליך',
  done: 'הושלם',
};

const STATUS_CLASS: Record<TaskStatus, string> = {
  open: 'th-badge-open',
  in_progress: 'th-badge-progress',
  done: 'th-badge-done',
};

// ─── עזרים ────────────────────────────────────────────────────────────────────

const isOverdue = (t: Task) => {
  if (t.status === 'done' || !t.dueDate) return false;
  return new Date(t.dueDate) < new Date();
};

const formatDateTime = (s?: string) => {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
};

const sortTasks = (tasks: Task[]) => {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aOver = isOverdue(a) ? 0 : 1;
    const bOver = isOverdue(b) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
};

// ─── CustomerSearch — חיפוש לקוח ──────────────────────────────────────────────

function CustomerSearch({
  customers,
  value,
  onChange,
  placeholder = 'חפש לקוח...',
}: {
  customers: CustomerOption[];
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // כאשר value מנוקה מחוץ לקומפוננט
  useEffect(() => {
    if (!value) setText('');
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.IDCustomer.includes(q)
    ).slice(0, 50);
  }, [customers, text]);

  const handleSelect = (c: CustomerOption) => {
    setText(c.name);
    onChange(c.id, c.name);
    setOpen(false);
  };

  const handleClear = () => {
    setText('');
    onChange('', '');
    setOpen(false);
  };

  return (
    <div className="th-customer-search" ref={ref}>
      <div className="th-search-input-wrap">
        <input
          className="th-input"
          placeholder={placeholder}
          value={text}
          onChange={e => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {text && (
          <button className="th-search-clear" onClick={handleClear}>✕</button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="th-search-dropdown">
          {filtered.map(c => (
            <div
              key={c.id}
              className="th-search-item"
              onMouseDown={() => handleSelect(c)}
            >
              <span className="th-search-name">{c.name}</span>
              <span className="th-search-id">{c.IDCustomer}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── קומפוננט ראשי ────────────────────────────────────────────────────────────

export default function TasksHub() {
  const router = useRouter();
  const { user } = useAuth();
  const { toasts, addToast, setToasts } = useToast();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentUsers, setAgentUsers] = useState<AgentUser[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [myUserId, setMyUserId] = useState('');

  // פילטרים
  const [filterAssignee, setFilterAssignee] = useState<'me' | 'all' | string>('me');
  const [filterStatus, setFilterStatus] = useState<'all' | TaskStatus | 'active'>('active');
  const [filterCustomerId, setFilterCustomerId] = useState('');

  // טופס הוספה
  const [showForm, setShowForm] = useState(false);
  const [newText, setNewText] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newAssigned, setNewAssigned] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newReminder, setNewReminder] = useState(15);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [saving, setSaving] = useState(false);

  // עריכת משימה
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editText, setEditText] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editAssigned, setEditAssigned] = useState('');
  const [editStatus, setEditStatus] = useState<TaskStatus>('open');
  const [editReminder, setEditReminder] = useState(15);
  const [editSaving, setEditSaving] = useState(false);

  // מחיקת משימה
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openEdit = (t: Task) => {
    setEditingTask(t);
    setEditText(t.text);
    setEditDue(t.dueDate ?? '');
    setEditAssigned(t.assignedTo);
    setEditStatus(t.status);
    setEditReminder(t.reminderMinutesBefore ?? 15);
  };

  const saveEdit = async () => {
    if (!editingTask || !editText.trim()) return;
    setEditSaving(true);
    try {
      const assignedUser = agentUsers.find(u => u.id === editAssigned);
      const dueChanged = (editingTask.dueDate || '') !== (editDue || '');
      const reminderChanged = (editingTask.reminderMinutesBefore ?? 15) !== (editReminder || 0);
      await updateDoc(doc(db, 'customerTasks', editingTask.id), {
        text: editText.trim(),
        dueDate: editDue || null,
        assignedTo: editAssigned,
        assignedToName: assignedUser?.name || assignedUser?.displayName || assignedUser?.email || '',
        status: editStatus,
        reminderMinutesBefore: editReminder || 15,
        ...(dueChanged || reminderChanged ? { reminderShown: false, snoozeUntil: null } : {}),
      });
      setTasks(prev => prev.map(t => t.id === editingTask.id ? {
        ...t,
        text: editText.trim(),
        dueDate: editDue || undefined,
        assignedTo: editAssigned,
        assignedToName: assignedUser?.name || assignedUser?.displayName || assignedUser?.email || '',
        status: editStatus,
        reminderMinutesBefore: editReminder || 15,
        ...(dueChanged || reminderChanged ? { reminderShown: false, snoozeUntil: undefined } : {}),
      } : t));
      setEditingTask(null);
      addToast('success', 'משימה עודכנה');
    } catch {
      addToast('error', 'כשל בשמירה');
    } finally {
      setEditSaving(false);
    }
  };

  // ─── מחיקת משימה (פתוח לכל חבר צוות) ─────────────────────────────────────────
  const deleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'customerTasks', taskId));
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setConfirmDeleteId(null);
      addToast('success', 'המשימה נמחקה');
    } catch {
      addToast('error', 'כשל במחיקת המשימה');
    }
  };

  // ─── טעינת uid שלי ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    setMyUserId(user.uid);
    setNewAssigned(user.uid);
  }, [user?.uid]);

  // ─── טעינת משתמשי סוכנות — רק פעילים ───────────────────────────────────────
  useEffect(() => {
    if (!selectedAgentId) return;
    const load = async () => {
      const q = query(
        collection(db, 'users'),
        where('agentId', '==', selectedAgentId),
        where('isActive', '==', true),
      );
      const snap = await getDocs(q);
      setAgentUsers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    };
    load();
  }, [selectedAgentId]);

  // ─── טעינת לקוחות לחיפוש ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAgentId) return;
    const load = async () => {
      const q = query(collection(db, 'customer'), where('AgentId', '==', selectedAgentId));
      const snap = await getDocs(q);
      setCustomers(snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: `${data.firstNameCustomer ?? ''} ${data.lastNameCustomer ?? ''}`.trim(),
          IDCustomer: data.IDCustomer ?? '',
        };
      }));
    };
    load();
  }, [selectedAgentId]);

  // ─── טעינת משימות ────────────────────────────────────────────────────────────
  const loadTasks = async () => {
    if (!selectedAgentId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'customerTasks'),
        where('agentId', '==', selectedAgentId),
      );
      const snap = await getDocs(q);
      const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Task[];

      const ids = Array.from(new Set(rows.map(r => r.customerId).filter(Boolean)));
      const nameMap: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10);
        const cq = query(collection(db, 'customer'), where('__name__', 'in', chunk));
        const cs = await getDocs(cq);
        cs.docs.forEach(d => {
          const data = d.data() as any;
          nameMap[d.id] = `${data.firstNameCustomer ?? ''} ${data.lastNameCustomer ?? ''}`.trim();
        });
      }
      setCustomerNames(nameMap);
      setTasks(rows);
    } catch {
      addToast('error', 'כשל בטעינת משימות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTasks(); }, [selectedAgentId]);

  // ─── פילטור + מיון ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = tasks;

    if (filterAssignee === 'me') {
      rows = rows.filter(t => t.assignedTo === myUserId);
    } else if (filterAssignee !== 'all') {
      rows = rows.filter(t => t.assignedTo === filterAssignee);
    }

    if (filterStatus === 'active') {
      rows = rows.filter(t => t.status !== 'done');
    } else if (filterStatus !== 'all') {
      rows = rows.filter(t => t.status === filterStatus);
    }

    if (filterCustomerId) {
      rows = rows.filter(t => t.customerId === filterCustomerId);
    }

    return sortTasks(rows);
  }, [tasks, filterAssignee, filterStatus, myUserId, filterCustomerId]);

  // ─── פעולות ──────────────────────────────────────────────────────────────────
  const markDone = async (taskId: string) => {
    await updateDoc(doc(db, 'customerTasks', taskId), { status: 'done' });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done' } : t));
  };

  const changeStatus = async (taskId: string, status: TaskStatus) => {
    await updateDoc(doc(db, 'customerTasks', taskId), { status });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
  };

  const addTask = async () => {
    if (!newText.trim() || !selectedAgentId || !user) return;
    setSaving(true);
    try {
      const assignedUser = agentUsers.find(u => u.id === newAssigned);
      await addDoc(collection(db, 'customerTasks'), {
        customerId: newCustomerId,
        agentId: selectedAgentId,
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
      setNewText(''); setNewDue(''); setNewCustomerId(''); setNewReminder(15); setShowForm(false);
      addToast('success', 'משימה נוספה בהצלחה');
      await loadTasks();
    } finally {
      setSaving(false);
    }
  };

  const getUserName = (uid: string) => {
    const u = agentUsers.find(x => x.id === uid);
    return u?.name || u?.displayName || u?.email || uid;
  };

  // ─── UI ──────────────────────────────────────────────────────────────────────
  const overdueCount = filtered.filter(isOverdue).length;
  const openCount = filtered.filter(t => t.status !== 'done').length;

  return (
    <div className="th-page" dir="rtl">
      {/* ── כותרת ── */}
      <div className="th-header">
        <div>
          <div className="th-title">משימות</div>
          <div className="th-subtitle">
            {openCount} פתוחות
            {overdueCount > 0 && <span className="th-overdue-badge"> · {overdueCount} באיחור</span>}
          </div>
        </div>
        <button className="th-btn-new" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'בטל' : '+ משימה חדשה'}
        </button>
      </div>

      {/* ── פילטרים ── */}
      <div className="th-filters">

        {/* אחראי — שלי + dropdown לשאר */}
        <div className="th-filter-group">
          <label className="th-filter-label">אחראי</label>
          <div className="th-toggle">
            <button
              className={`th-toggle-btn${filterAssignee === 'me' ? ' active' : ''}`}
              onClick={() => setFilterAssignee('me')}
            >שלי</button>
            <button
              className={`th-toggle-btn${filterAssignee === 'all' ? ' active' : ''}`}
              onClick={() => setFilterAssignee('all')}
            >כולם</button>
          </div>
          <select
            className="th-select"
            value={filterAssignee === 'me' || filterAssignee === 'all' ? '' : filterAssignee}
            onChange={e => {
              if (e.target.value) setFilterAssignee(e.target.value);
            }}
          >
            <option value="">חבר צוות...</option>
            {agentUsers
              .filter(u => u.id !== myUserId)
              .map(u => (
                <option key={u.id} value={u.id}>
                  {u.name || u.displayName || u.email}
                </option>
              ))}
          </select>
        </div>

        {/* סטטוס */}
        <div className="th-filter-group">
          <label className="th-filter-label">סטטוס</label>
          <div className="th-toggle">
            {([
              ['active', 'פעילות'],
              ['open', 'פתוחה'],
              ['in_progress', 'בתהליך'],
              ['done', 'הושלם'],
              ['all', 'הכל'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                className={`th-toggle-btn${filterStatus === val ? ' active' : ''}`}
                onClick={() => setFilterStatus(val as any)}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* סינון לפי לקוח */}
        <div className="th-filter-group">
          <label className="th-filter-label">לקוח</label>
          <CustomerSearch
            customers={customers}
            value={filterCustomerId}
            onChange={(id) => setFilterCustomerId(id)}
            placeholder="חפש לקוח לסינון..."
          />
        </div>

        {/* סוכן — למנהל */}
        <select className="th-select" value={selectedAgentId} onChange={handleAgentChange}>
          <option value="">בחר סוכן</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* ── טופס הוספה ── */}
      {showForm && (
        <div className="th-form">
          <div className="th-form-title">משימה חדשה</div>
          <input
            className="th-input"
            placeholder="תיאור המשימה *"
            value={newText}
            onChange={e => setNewText(e.target.value)}
          />
          <div className="th-form-row">
            <div className="th-form-field">
              <label className="th-label">לקוח</label>
              <CustomerSearch
                customers={customers}
                value={newCustomerId}
                onChange={(id) => setNewCustomerId(id)}
                placeholder="חפש לפי שם / ת.ז..."
              />
            </div>
            <div className="th-form-field">
              <label className="th-label">אחראי</label>
              <select className="th-input" value={newAssigned} onChange={e => setNewAssigned(e.target.value)}>
                <option value="">בחר אחראי</option>
                {agentUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.displayName || u.email}</option>
                ))}
              </select>
            </div>
            <div className="th-form-field">
              <label className="th-label">תאריך ושעה</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="date"
                  className="th-input"
                  value={newDue.split('T')[0] ?? ''}
                  onChange={e => {
                    const time = newDue.split('T')[1] ?? '10:00';
                    setNewDue(`${e.target.value}T${time}`);
                  }}
                />
                <input
                  type="time"
                  className="th-input"
                  value={newDue.split('T')[1] ?? ''}
                  onChange={e => {
                    const date = newDue.split('T')[0] ?? '';
                    setNewDue(`${date}T${e.target.value}`);
                  }}
                />
              </div>
            </div>
            <div className="th-form-field">
              <label className="th-label">תזכורת (דקות לפני)</label>
              <input
                type="number"
                min={0}
                className="th-input"
                value={newReminder}
                onChange={e => setNewReminder(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="th-form-actions">
            <button className="th-btn-save" onClick={addTask} disabled={!newText.trim() || saving}>
              {saving ? 'שומר...' : 'הוסף משימה'}
            </button>
            <button className="th-btn-cancel" onClick={() => setShowForm(false)}>בטל</button>
          </div>
        </div>
      )}

      {/* ── רשימת משימות ── */}
      {loading ? (
        <div className="th-loading">טוען משימות...</div>
      ) : filtered.length === 0 ? (
        <div className="th-empty">אין משימות להצגה</div>
      ) : (
        <div className="th-list">
          {filtered.map(t => {
            const overdue = isOverdue(t);
            const custName = customerNames[t.customerId] || '';
            return (
              <div
                key={t.id}
                className={`th-task${t.status === 'done' ? ' th-task-done' : ''}${overdue ? ' th-task-overdue' : ''}`}
              >
                <button
                  className={`th-check${t.status === 'done' ? ' th-check-done' : ''}`}
                  onClick={() => t.status !== 'done' && markDone(t.id)}
                  title={t.status === 'done' ? 'הושלם' : 'סמן כהושלם'}
                >
                  {t.status === 'done' ? '✓' : ''}
                </button>

                <div className="th-task-body">
                  <div className="th-task-text">{t.text}</div>
                  <div className="th-task-meta">
                    {custName && (
                      <span
                        className="th-task-customer"
                        onClick={() => t.customerId && router.push(`/customers/${t.customerId}`)}
                        title="עבור לדף הלקוח"
                      >
                        👤 {custName}
                      </span>
                    )}
                    {t.dueDate && (
                      <span className={`th-task-due${overdue ? ' th-due-late' : ''}`}>
                        📅 {formatDateTime(t.dueDate)}
                        {overdue && ' — באיחור'}
                      </span>
                    )}
                    <span className="th-task-assignee">
                      🙋 {t.assignedToName || getUserName(t.assignedTo)}
                    </span>
                  </div>
                </div>

                {/* ── כפתורי ערוך / מחק (פתוח לכל חבר צוות) ── */}
                <button
                  className="th-btn-edit-task"
                  onClick={() => openEdit(t)}
                  title="ערוך משימה"
                >✏</button>

                {confirmDeleteId === t.id ? (
                  <div className="th-delete-confirm">
                    <span className="th-delete-confirm-text">למחוק?</span>
                    <button
                      className="th-btn-delete-task th-btn-delete-confirm"
                      onClick={() => deleteTask(t.id)}
                      title="אישור מחיקה"
                    >כן</button>
                    <button
                      className="th-btn-delete-task"
                      onClick={() => setConfirmDeleteId(null)}
                      title="ביטול"
                    >לא</button>
                  </div>
                ) : (
                  <button
                    className="th-btn-delete-task"
                    onClick={() => setConfirmDeleteId(t.id)}
                    title="מחק משימה"
                  >🗑</button>
                )}

                <select
                  className={`th-status-select ${STATUS_CLASS[t.status]}`}
                  value={t.status}
                  onChange={e => changeStatus(t.id, e.target.value as TaskStatus)}
                >
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {/* ── מודל עריכה ── */}
      {editingTask && (
        <div className="th-modal-overlay" onClick={() => setEditingTask(null)}>
          <div className="th-modal" onClick={e => e.stopPropagation()}>
            <div className="th-modal-title">עריכת משימה</div>
            <div className="th-form-field" style={{ marginBottom: 10 }}>
              <label className="th-label">תיאור</label>
              <input
                className="th-input"
                value={editText}
                onChange={e => setEditText(e.target.value)}
              />
            </div>
            <div className="th-form-row" style={{ marginBottom: 10 }}>
              <div className="th-form-field">
                <label className="th-label">תאריך ושעה</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="date"
                    className="th-input"
                    value={editDue.split('T')[0] ?? ''}
                    onChange={e => {
                      const time = editDue.split('T')[1] ?? '10:00';
                      setEditDue(`${e.target.value}T${time}`);
                    }}
                  />
                  <input
                    type="time"
                    className="th-input"
                    value={editDue.split('T')[1] ?? ''}
                    onChange={e => {
                      const date = editDue.split('T')[0] ?? '';
                      setEditDue(`${date}T${e.target.value}`);
                    }}
                  />
                </div>
              </div>
              <div className="th-form-field">
                <label className="th-label">אחראי</label>
                <select className="th-input" value={editAssigned} onChange={e => setEditAssigned(e.target.value)}>
                  {agentUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name || u.displayName || u.email}</option>
                  ))}
                </select>
              </div>
              <div className="th-form-field">
                <label className="th-label">סטטוס</label>
                <select className="th-input" value={editStatus} onChange={e => setEditStatus(e.target.value as TaskStatus)}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="th-form-field">
                <label className="th-label">תזכורת (דקות לפני)</label>
                <input
                  type="number"
                  min={0}
                  className="th-input"
                  value={editReminder}
                  onChange={e => setEditReminder(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="th-form-actions">
              <button className="th-btn-save" onClick={saveEdit} disabled={!editText.trim() || editSaving}>
                {editSaving ? 'שומר...' : 'שמור'}
              </button>
              <button className="th-btn-cancel" onClick={() => setEditingTask(null)}>בטל</button>
            </div>
          </div>
        </div>
      )}

      {toasts.map(t => (
        <ToastNotification
          key={t.id}
          type={t.type}
          message={t.message}
          className={t.isHiding ? 'hide' : ''}
          onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
        />
      ))}
    </div>
  );
}
