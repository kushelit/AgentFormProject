'use client';

import { useEffect, useState } from 'react';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  serverTimestamp, orderBy, doc, getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';

interface Note {
  id: string;
  text: string;
  createdBy: string;
  createdByName: string;
  createdAt: any;
}

interface Props {
  customerId: string;
  agentId: string;
}

export default function CustomerNotes({ customerId, agentId }: Props) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [myName, setMyName] = useState('');

  // ─── עריכה ───────────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ─── מחיקה ───────────────────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    const loadName = async () => {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const d = snap.data() as any;
        setMyName(d.name || d.displayName || user.email || 'משתמש');
      } else {
        setMyName(user.email || 'משתמש');
      }
    };
    loadName();
  }, [user?.uid]);

  const load = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'customerNotes'),
        where('customerId', '==', customerId),
        where('agentId', '==', agentId),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      setNotes(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [customerId]);

  const addNote = async () => {
    if (!text.trim() || !user) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'customerNotes'), {
        customerId,
        agentId,
        text: text.trim(),
        createdBy: user.uid,
        createdByName: myName || user.email || 'משתמש',
        createdAt: serverTimestamp(),
      });
      setText('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  // ─── שמירת עריכה ─────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    setEditSaving(true);
    try {
      await updateDoc(doc(db, 'customerNotes', editingId), {
        text: editText.trim(),
        editedAt: serverTimestamp(),
      });
      setNotes(prev =>
        prev.map(n => n.id === editingId ? { ...n, text: editText.trim() } : n),
      );
      setEditingId(null);
      setEditText('');
    } finally {
      setEditSaving(false);
    }
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditText(note.text);
    setConfirmDeleteId(null); // סגור אישור מחיקה אם פתוח
  };

  const cancelEdit = () => { setEditingId(null); setEditText(''); };

  // ─── מחיקה ───────────────────────────────────────────────────────────────────
  const deleteNote = async (noteId: string) => {
    await deleteDoc(doc(db, 'customerNotes', noteId));
    setNotes(prev => prev.filter(n => n.id !== noteId));
    setConfirmDeleteId(null);
  };

  const formatDate = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  // רק היוצר יכול לערוך/למחוק
  const isOwner = (note: Note) => note.createdBy === user?.uid;

  return (
    <div className="cn-wrap">
      {/* ── טופס הוספה ── */}
      <div className="cn-add-box">
        <textarea
          className="cn-textarea"
          placeholder="הוסף הערה..."
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) addNote(); }}
        />
        <div className="cn-add-footer">
          <span className="cn-hint">Ctrl+Enter לשמירה</span>
          <button className="cn-btn-add" onClick={addNote} disabled={!text.trim() || saving}>
            {saving ? 'שומר...' : (text.trim() ? 'שמור' : '+ הוסף הערה')}
          </button>
        </div>
      </div>

      {/* ── רשימת הערות ── */}
      {loading ? (
        <div className="cp-loading-inline">טוען...</div>
      ) : notes.length === 0 ? (
        <div className="cp-empty">אין הערות עדיין</div>
      ) : (
        <div className="cn-list">
          {notes.map(n => (
            <div key={n.id} className="cn-note">
              <div className="cn-note-header">
                <div className="cn-note-avatar">
                  {(n.createdByName?.[0] ?? '?').toUpperCase()}
                </div>
                <span className="cn-note-author">{n.createdByName}</span>
                <span className="cn-note-date">{formatDate(n.createdAt)}</span>

                {/* ── כפתורי ערוך / מחק (רק ליוצר) ── */}
                {isOwner(n) && editingId !== n.id && (
                  <div className="cn-note-actions">
                    <button
                      className="cn-btn-icon"
                      title="ערוך הערה"
                      onClick={() => startEdit(n)}
                    >
                      ✏️
                    </button>
                    {confirmDeleteId === n.id ? (
                      <>
                        <span className="cn-confirm-text">למחוק?</span>
                        <button
                          className="cn-btn-icon cn-btn-danger"
                          onClick={() => deleteNote(n.id)}
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
                        title="מחק הערה"
                        onClick={() => setConfirmDeleteId(n.id)}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── תוכן ── */}
              {editingId === n.id ? (
                <div className="cn-edit-box">
                  <textarea
                    className="cn-textarea"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={3}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveEdit(); }}
                  />
                  <div className="cn-add-footer">
                    <span className="cn-hint">Ctrl+Enter לשמירה</span>
                    <button className="cn-btn-cancel" onClick={cancelEdit}>בטל</button>
                    <button
                      className="cn-btn-add"
                      onClick={saveEdit}
                      disabled={!editText.trim() || editSaving}
                    >
                      {editSaving ? 'שומר...' : 'שמור'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="cn-note-text">{n.text}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
