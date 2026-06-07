'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';
import './TasksHub.css';

type TaskStatus = 'open' | 'in_progress' | 'done';

interface Task {
  id: string;
  text: string;
  dueDate?: string;
  assignedTo: string;
  assignedToName: string;
  status: TaskStatus;
  createdAt: any;
  customerId: string;
  agentId: string;
}

interface AgentUser {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
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

const sortTasks = (tasks: Task[]) => [...tasks].sort((a, b) => {
  const aOver = isOverdue(a) ? 0 : 1;
  const bOver = isOverdue(b) ? 0 : 1;
  if (aOver !== bOver) return aOver - bOver;
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
});

// ── קומפוננט בחירת תאריך+שעה ──
function DateTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const datePart = value.split('T')[0] ?? '';
  const hourPart = value.split('T')[1]?.split(':')[0] ?? '09';
  const minPart  = value.split('T')[1]?.split(':')[1] ?? '00';

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexDirection: 'row-reverse' }}>
      <input
        type="date"
        className="th-input"
        style={{ flex: 1 }}
        value={datePart}
        onChange={e => onChange(`${e.target.value}T${hourPart}:${minPart}`)}
      />
      <select
        className="th-input"
        style={{ width: 70 }}
        value={hourPart}
        onChange={e => onChange(`${datePart}T${e.target.value}:${minPart}`)}
      >
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span>:</span>
      <select
        className="th-input"
        style={{ width: 70 }}
        value={minPart}
        onChange={e => onChange(`${datePart}T${hourPart}:${e.target.value}`)}
      >
        {['00', '15', '30', '45'].map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}

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
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | TaskStatus | 'active'>('active');

  // טופס הוספה
  const [showForm, setShowForm] = useState(false);
  const [newText, setNewText] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newAssigned, setNewAssigned] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [customers, setCustomers] = useState<{ id: string; name: string; IDCustomer: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // עריכה
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editText, setEditText] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editAssigned, setEditAssigned] = useState('');
  const [editStatus, setEditStatus] = useState<TaskStatus>('open');
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = (t: Task) => {
    setEditingTask(t);
    setEditText(t.text);
    setEditDue(t.dueDate ?? '');
    setEditAssigned(t.assignedTo);
    setEditStatus(t.status);
  };

  const saveEdit = async () => {
    if (!editingTask || !editText.trim()) return;
    setEditSaving(true);
    try {
      const assignedUser = agentUsers.find(u => u.id === editAssigned);
      await updateDoc(doc(db, 'customerTasks', editingTask.id), {
        text: editText.trim(),
        dueDate: editDue || null,
        assignedTo: editAssigned,
        assignedToName: assignedUser?.name || assignedUser?.displayName || assignedUser?.email || '',
        status: editStatus,
      });
      setTasks(prev => prev.map(t => t.id === editingTask.id ? {
        ...t, text: editText.trim(), dueDate: editDue || undefined,
        assignedTo: editAssigned,
        assignedToName: assignedUser?.name || assignedUser?.displayName || assignedUser?.email || '',
        status: editStatus,
      } : t));
      setEditingTask(null);
      addToast('success', 'משימה עודכנה');
    } catch {
      addToast('error', 'כשל בשמירה');
    } finally {
      setEditSaving(false);
    }
  };

  // טעינת uid
  useEffect(() => {
    if (!user?.uid) return;
    setMyUserId(user.uid);
    setNewAssigned(user.uid);
  }, [user?.uid]);

  useEffect(() => {
    if (myUserId && !filterAssignee) setFilterAssignee(myUserId);
  }, [myUserId]);

  // טעינת משתמשי סוכנות
  useEffect(() => {
    if (!selectedAgentId) return;
    getDocs(query(collection(db, 'users'), where('agentId', '==', selectedAgentId)))
      .then(snap => setAgentUsers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
  }, [selectedAgentId]);

  // טעינת לקוחות
  useEffect(() => {
    if (!selectedAgentId) return;
    getDocs(query(collection(db, 'customer'), where('AgentId', '==', selectedAgentId)))
      .then(snap => setCustomers(snap.docs.map(d => {
        const data = d.data() as any;
        return { id: d.id, name: `${data.firstNameCustomer ?? ''} ${data.lastNameCustomer ?? ''}`.trim(), IDCustomer: data.IDCustomer ?? '' };
      })));
  }, [selectedAgentId]);

  // טעינת משימות
  const loadTasks = async () => {
    if (!selectedAgentId) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'customerTasks'), where('agentId', '==', selectedAgentId)));
      const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Task[];

      const ids = Array.from(new Set(rows.map(r => r.customerId).filter(Boolean)));
      const nameMap: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 10) {
        const cs = await getDocs(query(collection(db, 'customer'), where('__name__', 'in', ids.slice(i, i + 10))));
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

  // פילטור ומיון
  const filtered = useMemo(() => {
    let rows = tasks;
    if (filterAssignee && filterAssignee !== 'all') rows = rows.filter(t => t.assignedTo === filterAssignee);
    if (filterStatus === 'active') rows = rows.filter(t => t.status !== 'done');
    else if (filterStatus !== 'all') rows = rows.filter(t => t.status === filterStatus);
    return sortTasks(rows);
  }, [tasks, filterAssignee, filterStatus]);

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
        createdAt: serverTimestamp(),
      });
      setNewText(''); setNewDue(''); setShowForm(false);
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

  const overdueCount = filtered.filter(isOverdue).length;
  const openCount = filtered.filter(t => t.status !== 'done').length;

  return (
    <div className="th-page" dir="rtl">
      {/* כותרת */}
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

      {/* פילטרים */}
      <div className="th-filters">
        <div className="th-filter-group">
          <label className="th-filter-label">אחראי</label>
          <select className="th-select" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
            <option value="all">כולם</option>
            {agentUsers.map(u => (
              <option key={u.id} value={u.id}>
                {u.name || u.displayName || u.email}
                {u.id === myUserId ? ' ★' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="th-filter-group">
          <label className="th-filter-label">סטטוס</label>
          <div className="th-toggle">
            {([['active', 'פעילות'], ['open', 'פתוחה'], ['in_progress', 'בתהליך'], ['done', 'הושלם'], ['all', 'הכל']] as const).map(([val, label]) => (
              <button key={val} className={`th-toggle-btn${filterStatus === val ? ' active' : ''}`} onClick={() => setFilterStatus(val as any)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* טופס הוספה */}
      {showForm && (
        <div className="th-form">
          <div className="th-form-title">משימה חדשה</div>
          <input className="th-input" placeholder="תיאור המשימה *" value={newText} onChange={e => setNewText(e.target.value)} />
          <div className="th-form-row">
            <div className="th-form-field">
              <label className="th-label">לקוח</label>
              <select className="th-input" value={newCustomerId} onChange={e => setNewCustomerId(e.target.value)}>
                <option value="">בחר לקוח</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.IDCustomer})</option>)}
              </select>
            </div>
            <div className="th-form-field">
              <label className="th-label">אחראי</label>
              <select className="th-input" value={newAssigned} onChange={e => setNewAssigned(e.target.value)}>
                <option value="">בחר אחראי</option>
                {agentUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.displayName || u.email}</option>)}
              </select>
            </div>
            <div className="th-form-field">
              <label className="th-label">תאריך ושעה</label>
              <DateTimePicker value={newDue} onChange={setNewDue} />
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

      {/* רשימת משימות */}
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
              <div key={t.id} className={`th-task${t.status === 'done' ? ' th-task-done' : ''}${overdue ? ' th-task-overdue' : ''}`}>
                <button className={`th-check${t.status === 'done' ? ' th-check-done' : ''}`}
                  onClick={() => t.status !== 'done' && markDone(t.id)}
                  title={t.status === 'done' ? 'הושלם' : 'סמן כהושלם'}>
                  {t.status === 'done' ? '✓' : ''}
                </button>
                <div className="th-task-body">
                  <div className="th-task-text">{t.text}</div>
                  <div className="th-task-meta">
                    {custName && (
                      <span className="th-task-customer"
                        onClick={() => t.customerId && router.push(`/customers/${t.customerId}`)}
                        title="עבור לדף הלקוח">
                        👤 {custName}
                      </span>
                    )}
                    {t.dueDate && (
                      <span className={`th-task-due${overdue ? ' th-due-late' : ''}`}>
                        📅 {formatDateTime(t.dueDate)}{overdue && ' — באיחור'}
                      </span>
                    )}
                    <span className="th-task-assignee">🙋 {t.assignedToName || getUserName(t.assignedTo)}</span>
                  </div>
                </div>
                <button className="th-btn-edit-task" onClick={() => openEdit(t)} title="ערוך משימה">✏</button>
                <select className={`th-status-select ${STATUS_CLASS[t.status]}`} value={t.status}
                  onChange={e => changeStatus(t.id, e.target.value as TaskStatus)}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {/* מודל עריכה */}
      {editingTask && (
        <div className="th-modal-overlay" onClick={() => setEditingTask(null)}>
          <div className="th-modal" onClick={e => e.stopPropagation()}>
            <div className="th-modal-title">עריכת משימה</div>
            <div className="th-form-field" style={{ marginBottom: 10 }}>
              <label className="th-label">תיאור</label>
              <input className="th-input" value={editText} onChange={e => setEditText(e.target.value)} />
            </div>
            <div className="th-form-row" style={{ marginBottom: 10 }}>
              <div className="th-form-field">
                <label className="th-label">תאריך ושעה</label>
                <DateTimePicker value={editDue} onChange={setEditDue} />
              </div>
              <div className="th-form-field">
                <label className="th-label">אחראי</label>
                <select className="th-input" value={editAssigned} onChange={e => setEditAssigned(e.target.value)}>
                  {agentUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.displayName || u.email}</option>)}
                </select>
              </div>
              <div className="th-form-field">
                <label className="th-label">סטטוס</label>
                <select className="th-input" value={editStatus} onChange={e => setEditStatus(e.target.value as TaskStatus)}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
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
        <ToastNotification key={t.id} type={t.type} message={t.message}
          className={t.isHiding ? 'hide' : ''}
          onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />
      ))}
    </div>
  );
}
