// /app/admin/api-auth-logs/page.tsx
// API requests that the server-side auth checks would block (or blocked) — see src/lib/server/auth.ts.
'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import AdminGuard from '../_components/AdminGuard';

type LogRow = {
  id: string;
  day: string;
  route: string;
  reason: string;
  status: number;
  mode: string;
  uid: string;
  userName: string;
  userRole: string;
  agentId: string;
  count: number;
  lastAt?: Date;
  extra?: Record<string, unknown>;
};

const fmtTime = (d?: Date) => (d ? d.toLocaleString('he-IL') : '');

function ApiAuthLogs() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [day, setDay] = useState('');
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const snap = await getDocs(query(collection(db, 'apiAuthLogs'), orderBy('lastAt', 'desc'), limit(1000)));
      setRows(snap.docs.map((d) => {
        const x = d.data() as any;
        return { id: d.id, ...x, lastAt: x.lastAt?.toDate?.() };
      }));
    } catch (e: any) {
      setError(e?.message || 'טעינת הלוגים נכשלה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const days = useMemo(() => Array.from(new Set(rows.map((r) => r.day))).sort().reverse(), [rows]);
  const filtered = useMemo(() => rows.filter((r) => !day || r.day === day), [rows, day]);

  const copyAll = async () => {
    const lines = filtered.map((r) =>
      [r.day, r.route, r.reason, `x${r.count}`, `user=${r.userName || r.uid} (${r.userRole || '-'})`,
        `agent=${r.agentId || '-'}`, `last=${fmtTime(r.lastAt)}`, r.extra ? JSON.stringify(r.extra) : ''].join(' | ')
    );
    const out = `apiAuthLogs — ${filtered.length} rows${day ? ` (${day})` : ''}\n` + lines.join('\n');
    setText(out);
    try {
      await navigator.clipboard.writeText(out);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is shown below for manual copy.
    }
  };

  return (
    <div dir="rtl" className="max-w-7xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">לוג בדיקות הרשאה בממשקים</h1>
      <p className="text-sm text-gray-600 mb-4">
        בקשות שהבדיקה בשרת הייתה חוסמת (מצב רישום) או חסמה (מצב חסימה). שורה אחת לכל יום + ממשק + משתמש + סוכן + סיבה.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={day} onChange={(e) => setDay(e.target.value)} className="border rounded px-2 py-1">
          <option value="">כל הימים</option>
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button onClick={load} className="border rounded px-3 py-1 hover:bg-gray-50">רענון</button>
        <button onClick={copyAll} disabled={!filtered.length}
          className="bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700 disabled:opacity-50">
          {copied ? 'הועתק ✓' : `העתק הכל (${filtered.length})`}
        </button>
      </div>

      {error && <div className="p-3 mb-4 rounded bg-red-50 text-red-700">{error}</div>}
      {loading ? (
        <div className="text-gray-500">טוען...</div>
      ) : !filtered.length ? (
        <div className="p-4 rounded bg-green-50 text-green-800">אין רשומות — לא נמצאו בקשות שהיו נחסמות.</div>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                {['יום', 'ממשק', 'סיבה', 'כמות', 'משתמש', 'תפקיד', 'סוכן מבוקש', 'אחרון', 'מצב'].map((h) => (
                  <th key={h} className="px-2 py-2 text-right whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-2 py-1 whitespace-nowrap">{r.day}</td>
                  <td className="px-2 py-1 font-mono">{r.route}</td>
                  <td className="px-2 py-1">{r.reason}</td>
                  <td className="px-2 py-1">{r.count}</td>
                  <td className="px-2 py-1">{r.userName || r.uid}</td>
                  <td className="px-2 py-1">{r.userRole}</td>
                  <td className="px-2 py-1 font-mono">{r.agentId}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{fmtTime(r.lastAt)}</td>
                  <td className="px-2 py-1">{r.mode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {text && (
        <textarea readOnly value={text} className="w-full h-48 mt-4 border rounded p-2 font-mono text-xs" dir="ltr" />
      )}
    </div>
  );
}

export default function ApiAuthLogsPage() {
  return (
    <AdminGuard>
      <ApiAuthLogs />
    </AdminGuard>
  );
}
