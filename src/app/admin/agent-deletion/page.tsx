'use client';

// מחיקה מלאה של סוכן שעזב — לפי סעיף השמירה והמחיקה בתנאי השימוש (90 יום מסיום המנוי).
// רק סוכנים בסטטוס עזיבה. תצוגה מקדימה ← הקלדת שם הסוכן ← מחיקה בסבבים עד הסוף.

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import AdminGuard from '../_components/AdminGuard';

type Candidate = {
  agentId: string;
  name: string;
  email: string;
  role: string;
  cancellationDate: string | null;
  daysSinceCancellation: number | null;
};

type Preview = {
  agent: Candidate;
  rows: { label: string; count: number }[];
  workers: { uid: string; name: string; email: string }[];
};

const RETENTION_DAYS = 90;

async function call(body: Record<string, unknown>) {
  const res = await apiFetch('/api/admin/agent-deletion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'הפעולה נכשלה');
  return data;
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('he-IL') : '—');

function AgentDeletion() {
  const [agents, setAgents] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState('');
  const [early, setEarly] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const [running, setRunning] = useState(false);
  const [rounds, setRounds] = useState(0);
  const [deleted, setDeleted] = useState<Record<string, number>>({});
  const [doneFor, setDoneFor] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setAgents((await call({ action: 'list' })).agents || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openPreview = async (a: Candidate) => {
    setError('');
    setPreview(null);
    setEarly(false);
    setConfirmText('');
    setRounds(0);
    setDeleted({});
    setDoneFor('');
    setPreviewLoading(a.agentId);
    try {
      setPreview(await call({ action: 'preview', agentId: a.agentId }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPreviewLoading('');
    }
  };

  const agent = preview?.agent;
  const expectedName = agent ? agent.name || agent.email : '';
  const isEarly = !!agent && (agent.daysSinceCancellation ?? 0) < RETENTION_DAYS;
  const totalDocs = useMemo(() => (preview?.rows || []).reduce((s, r) => s + r.count, 0), [preview]);
  const canDelete = !!agent && !running && confirmText.trim() === expectedName && (!isEarly || early);

  const runDeletion = async () => {
    if (!agent) return;
    setRunning(true);
    setError('');
    try {
      for (let i = 1; i <= 200; i++) {
        const r = await call({ action: 'delete', agentId: agent.agentId, confirmName: confirmText.trim() });
        setRounds(i);
        setDeleted((prev) => {
          const next = { ...prev };
          for (const [k, n] of Object.entries(r.counts || {})) next[k] = (next[k] ?? 0) + (n as number);
          return next;
        });
        if (r.done) {
          setDoneFor(expectedName);
          setPreview(null);
          await load();
          return;
        }
      }
      setError('המחיקה עדיין לא הסתיימה. לחצי שוב על "מחיקה" כדי להמשיך מהמקום שבו עצרה.');
    } catch (e: any) {
      setError(`${e.message} — אפשר ללחוץ שוב על "מחיקה" כדי להמשיך מהמקום שבו עצרה.`);
    } finally {
      setRunning(false);
    }
  };

  const deletedTotal = Object.values(deleted).reduce((s, n) => s + n, 0);

  return (
    <div dir="rtl" className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">מחיקת סוכן שעזב</h1>
      <p className="text-sm text-gray-600 mb-4">
        מחיקה מלאה וסופית של כל נתוני הסוכן: לקוחות, עמלות, טעינות, קבצים, עובדים והחשבון עצמו.
        מוצגים רק סוכנים בסטטוס עזיבה. לפי התנאים, המידע נמחק {RETENTION_DAYS} יום אחרי סיום המנוי, או מוקדם יותר לבקשת הסוכן.
      </p>

      {error && <div className="p-3 mb-4 rounded bg-red-50 text-red-700">{error}</div>}
      {doneFor && (
        <div className="p-3 mb-4 rounded bg-green-50 text-green-800">
          הסוכן {doneFor} נמחק במלואו ({deletedTotal.toLocaleString('he-IL')} פריטים). התיעוד נשמר ב-agentDeletionLogs.
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <button onClick={load} className="border rounded px-3 py-1 hover:bg-gray-50" disabled={running}>רענון</button>
      </div>

      {loading ? (
        <div className="text-gray-500">טוען...</div>
      ) : !agents.length ? (
        <div className="p-4 rounded bg-green-50 text-green-800">אין סוכנים בסטטוס עזיבה.</div>
      ) : (
        <div className="overflow-x-auto border rounded mb-6">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                {['שם', 'אימייל', 'תפקיד', 'תאריך ביטול', 'ימים מאז', ''].map((h) => (
                  <th key={h} className="px-2 py-2 text-right whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => {
                const due = (a.daysSinceCancellation ?? 0) >= RETENTION_DAYS;
                return (
                  <tr key={a.agentId} className={`border-t ${preview?.agent.agentId === a.agentId ? 'bg-blue-50' : ''}`}>
                    <td className="px-2 py-1">{a.name || '—'}</td>
                    <td className="px-2 py-1" dir="ltr">{a.email}</td>
                    <td className="px-2 py-1">{a.role}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{fmtDate(a.cancellationDate)}</td>
                    <td className="px-2 py-1">
                      <span className={`px-2 py-0.5 rounded text-xs ${due ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                        {a.daysSinceCancellation ?? '?'} {due ? '· עבר 90' : '· פחות מ-90'}
                      </span>
                    </td>
                    <td className="px-2 py-1">
                      <button
                        onClick={() => openPreview(a)}
                        disabled={running || !!previewLoading}
                        className="border rounded px-2 py-0.5 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {previewLoading === a.agentId ? 'בודק...' : 'מה יימחק?'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {preview && agent && (
        <div className="border rounded p-4 bg-white">
          <h2 className="text-lg font-semibold mb-2">
            תצוגה מקדימה: {agent.name || agent.email}
            <span className="text-sm font-normal text-gray-500"> · עדיין לא נמחק כלום</span>
          </h2>

          <div className="mb-3 text-sm">
            סה&quot;כ {totalDocs.toLocaleString('he-IL')} פריטים, {preview.workers.length} עובדים, והחשבון של הסוכן.
          </div>

          {preview.rows.length ? (
            <div className="overflow-x-auto border rounded mb-3 max-h-80 overflow-y-auto">
              <table className="min-w-full text-sm">
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.label} className="border-t">
                      <td className="px-2 py-1 font-mono" dir="ltr">{r.label}</td>
                      <td className="px-2 py-1">{r.count.toLocaleString('he-IL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mb-3 text-sm text-gray-600">לא נמצאו נתונים — יימחקו רק החשבון והעובדים.</div>
          )}

          {!!preview.workers.length && (
            <div className="mb-3 text-sm">
              <div className="font-medium">עובדים שיימחקו:</div>
              <ul className="list-disc pr-6">
                {preview.workers.map((w) => <li key={w.uid}>{w.name || '—'} <span dir="ltr">{w.email}</span></li>)}
              </ul>
            </div>
          )}

          {isEarly && (
            <label className="flex items-center gap-2 mb-3 p-2 rounded bg-amber-50 text-amber-900 text-sm">
              <input type="checkbox" checked={early} onChange={(e) => setEarly(e.target.checked)} disabled={running} />
              עברו רק {agent.daysSinceCancellation ?? '?'} ימים מהביטול. זו מחיקה מוקדמת לבקשת הסוכן.
            </label>
          )}

          <div className="p-3 rounded bg-red-50 text-red-800 text-sm mb-3">
            המחיקה סופית ואי אפשר לשחזר אותה. כדי לאשר, הקלידי את הטקסט: <strong>{expectedName}</strong>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={running}
              className="border rounded px-2 py-1 min-w-64"
              placeholder="שם הסוכן"
            />
            <button
              onClick={runDeletion}
              disabled={!canDelete}
              className="bg-red-600 text-white rounded px-4 py-1 hover:bg-red-700 disabled:opacity-50"
            >
              {running ? 'מוחק...' : 'מחיקה'}
            </button>
            <button onClick={() => setPreview(null)} disabled={running} className="border rounded px-3 py-1 hover:bg-gray-50">
              ביטול
            </button>
          </div>

          {(running || rounds > 0) && (
            <div className="mt-3 text-sm text-gray-700">
              סבב {rounds} · נמחקו עד כה {deletedTotal.toLocaleString('he-IL')} פריטים
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentDeletionPage() {
  return (
    <AdminGuard>
      <AgentDeletion />
    </AdminGuard>
  );
}
