'use client';

// app/admin/open-questions/page.tsx
// שאלות פתוחות מול החברות בנושא היקף: כל השאלות (מתגיות בדפים ומהמסך הזה), סינון, תשובה וסטטוס. לאדמין בלבד.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/firebase';
import Link from 'next/link';
import AdminGuard from '@/app/admin/_components/AdminGuard';
import { useAuth } from '@/lib/firebase/AuthContext';
import { ANCHORS, STATUS_LABEL, type AdminQuestion, type AdminQuestionStatus } from '@/lib/adminQuestions/types';
import { postAdminQuestion, useAdminQuestions } from '@/components/admin/adminQuestions/useAdminQuestions';
import t from '@/components/commission/summary/table.module.css';

const STATUS_STYLE: Record<AdminQuestionStatus, string> = {
  open: 'bg-amber-100 text-amber-800',
  answered: 'bg-green-100 text-green-800',
  closed: 'bg-slate-200 text-slate-600',
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('he-IL') : '');

export default function OpenQuestionsPage() {
  const { detail } = useAuth();
  const { questions, sync, error } = useAdminQuestions(detail?.role === 'admin');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState<'' | AdminQuestionStatus>('open');
  const [seeding, setSeeding] = useState(false);
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const [allCompanies, setAllCompanies] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      await auth.authStateReady();
      const snap = await getDocs(collection(db, 'company'));
      const cs = snap.docs.map((d) => ({ id: d.id, name: String((d.data() as any)?.companyName ?? d.id) }));
      cs.sort((a, b) => a.name.localeCompare(b.name, 'he'));
      setAllCompanies(cs);
    })().catch(() => {});
  }, []);

  const companies = useMemo(() => [...new Set((questions || []).map((q) => q.company).filter(Boolean))], [questions]);
  const list = (questions || []).filter((q) => (!company || q.company === company) && (!status || q.status === status));
  const counts = (questions || []).reduce<Record<string, number>>((a, q) => ((a[q.status] = (a[q.status] || 0) + 1), a), {});

  const runSync = async () => {
    setSeeding(true);
    setMsg('');
    try {
      const r = await postAdminQuestion({ action: 'sync' });
      const parts = [`נוספו ${r.newCount}`, `עודכנו ${r.updateCount}`];
      if (r.editedCount) parts.push(`${r.editedCount} לא עודכנו כי ערכת אותן במסך`);
      setMsg(parts.join(' · '));
    } catch (e: any) {
      setMsg(e?.message || 'שגיאה');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <AdminGuard>
      <div className="p-6 max-w-[1300px] mx-auto text-right" dir="rtl">
        <h1 className="text-2xl font-bold mb-1">שאלות פתוחות – היקף</h1>
        <p className="text-sm text-slate-500 mb-5">
          שאלות שעולות בלימוד דוחות ההיקף מול כל חברה. מוצגות לאדמין בלבד — כאן, וכתגית ליד הנושא בדף ההיקף (שם אפשר להוסיף ולענות תוך כדי פגישה).
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">חברה</label>
            <select className="border rounded-lg px-2 py-1.5 bg-white text-sm" value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">כל החברות</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex gap-1">
            {(['open', 'answered', 'closed', ''] as const).map((sv) => (
              <button
                key={sv || 'all'}
                type="button"
                onClick={() => setStatus(sv)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${status === sv ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white'}`}
              >
                {sv ? STATUS_LABEL[sv] : 'הכל'} {sv ? `(${counts[sv] || 0})` : `(${questions?.length || 0})`}
              </button>
            ))}
          </div>
          {sync && sync.newCount + sync.updateCount + sync.adoptCount > 0 && (
            <button type="button" onClick={runSync} disabled={seeding} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-amber-500 text-white disabled:opacity-40" title="שאלות שזוהו בבדיקת הדוחות. לא משנה סטטוס ותשובות, ולא דורס שאלות שערכת">
              סנכרון שאלות: {sync.newCount ? `${sync.newCount} חדשות` : ''}{sync.newCount && sync.updateCount ? ' · ' : ''}{sync.updateCount ? `${sync.updateCount} עדכוני נוסח` : ''}{!sync.newCount && !sync.updateCount ? 'קישור השאלות הקיימות' : ''}
            </button>
          )}
          {sync && sync.editedCount > 0 && (
            <span className="text-xs text-slate-500 pb-2" title="ערכת את הנוסח במסך — הסנכרון לא דורס">
              {sync.editedCount} שאלות שערכת יש להן נוסח חדש בקוד (לא יידרס)
            </span>
          )}
          <button type="button" onClick={() => setAdding((a) => !a)} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-indigo-600 text-white">
            + שאלה חדשה
          </button>
          {msg && <span className="text-sm text-slate-600 pb-1.5">{msg}</span>}
        </div>

        {adding && <NewQuestionForm companies={allCompanies} onDone={() => setAdding(false)} />}

        {error ? (
          <div className="p-4 rounded-lg bg-red-50 text-red-700">{error}</div>
        ) : !questions ? (
          <div className="p-6 text-slate-500">טוען…</div>
        ) : list.length === 0 ? (
          <div className="p-10 text-center text-slate-500 border border-dashed rounded-2xl">אין שאלות להצגה.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${t.cleanTable} w-full text-sm`}>
              <thead>
                <tr>
                  <th className="px-3 py-2">חברה</th>
                  <th className="px-3 py-2">איפה</th>
                  <th className="px-3 py-2 min-w-[320px]">שאלה ודוגמה</th>
                  <th className="px-3 py-2 min-w-[260px]">תשובה</th>
                  <th className="px-3 py-2">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {list.map((q) => <Row key={q.id} q={q} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}

function NewQuestionForm({ companies, onDone }: { companies: { id: string; name: string }[]; onDone: () => void }) {
  const [companyId, setCompanyId] = useState('');
  const [location, setLocation] = useState('');
  const [question, setQuestion] = useState('');
  const [example, setExample] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const company = companies.find((c) => c.id === companyId);

  const create = async () => {
    setBusy(true);
    setErr('');
    try {
      await postAdminQuestion({ action: 'create', companyId, company: company?.name || '', location, question, example });
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'שגיאה');
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 p-4 border rounded-2xl bg-slate-50 grid gap-3 max-w-[900px]">
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <label className="block text-xs font-semibold text-slate-600 mb-1">חברה</label>
          <select className="w-full border rounded-lg px-2 py-1.5 bg-white text-sm" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">בחירת חברה</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[260px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">נושא / איפה</label>
          <input className="w-full border rounded-lg px-2 py-1.5 text-sm" value={location} onChange={(e) => setLocation(e.target.value)} placeholder='למשל: דוח היקף, לשונית "פירוט מקדמות"' />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">שאלה</label>
        <textarea className="w-full border rounded-lg px-2 py-1.5 text-sm" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">דוגמה (סוכן, פוליסה, סכומים) — אופציונלי</label>
        <textarea className="w-full border rounded-lg px-2 py-1.5 text-sm" rows={2} value={example} onChange={(e) => setExample(e.target.value)} />
      </div>
      <div className="flex gap-2 items-center">
        <button type="button" disabled={busy || !companyId || !question.trim()} onClick={create} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-indigo-600 text-white disabled:opacity-40">הוספה</button>
        <button type="button" disabled={busy} onClick={onDone} className="px-3 py-1.5 rounded-lg text-sm border bg-white">ביטול</button>
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>
    </div>
  );
}

function Row({ q }: { q: AdminQuestion }) {
  const [answer, setAnswer] = useState(q.answer);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(q.question);
  const [example, setExample] = useState(q.example);
  const [location, setLocation] = useState(q.location);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const where = ANCHORS[q.anchor];

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await postAdminQuestion({ action: 'update', id: q.id, patch });
      setEditing(false);
    } catch (e: any) {
      setErr(e?.message || 'שגיאה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="align-top">
      <td className="px-3 py-3 font-semibold whitespace-nowrap">{q.company}</td>
      <td className="px-3 py-3 text-xs">
        {where ? <Link href={where.href} className="text-indigo-600 hover:underline">{where.label}</Link> : q.location || q.anchor || '—'}
      </td>
      <td className="px-3 py-3">
        {editing ? (
          <div className="grid gap-2">
            <textarea className="w-full border rounded-md px-2 py-1" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
            <textarea className="w-full border rounded-md px-2 py-1" rows={3} value={example} onChange={(e) => setExample(e.target.value)} placeholder="דוגמה (סוכן, פוליסה, סכומים)" />
            {!where && <input className="w-full border rounded-md px-2 py-1" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="נושא / איפה" />}
            <div className="flex gap-2">
              <button type="button" disabled={busy || !question.trim()} onClick={() => save({ question, example, ...(where ? {} : { location }) })} className="px-2 py-1 rounded-md text-xs font-bold bg-indigo-600 text-white disabled:opacity-40">שמירת נוסח</button>
              <button type="button" disabled={busy} onClick={() => { setEditing(false); setQuestion(q.question); setExample(q.example); setLocation(q.location); }} className="px-2 py-1 rounded-md text-xs border">ביטול</button>
            </div>
          </div>
        ) : (
          <>
            <div className="font-semibold leading-relaxed">{q.question}</div>
            {q.example && <div className="mt-1 text-slate-600 bg-slate-50 rounded-md px-2 py-1 leading-relaxed">דוגמה: {q.example}</div>}
            <div className="mt-1 text-xs text-slate-400">
              {q.createdBy} · {fmtDate(q.createdAt)} ·{' '}
              <button type="button" onClick={() => setEditing(true)} className="text-indigo-600 hover:underline">עריכה</button>
            </div>
          </>
        )}
      </td>
      <td className="px-3 py-3">
        <textarea className="w-full border rounded-md px-2 py-1" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="התשובה שקיבלנו…" />
        <div className="flex flex-wrap gap-2 mt-1">
          <button type="button" disabled={busy || answer === q.answer} onClick={() => save({ answer, status: answer.trim() ? 'answered' : q.status })} className="px-2 py-1 rounded-md text-xs font-bold bg-indigo-600 text-white disabled:opacity-40">
            שמירה
          </button>
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
        {q.updatedAt && q.updatedBy && <div className="mt-1 text-xs text-slate-400">עודכן {fmtDate(q.updatedAt)} · {q.updatedBy}</div>}
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${STATUS_STYLE[q.status]}`}>{STATUS_LABEL[q.status]}</span>
        <div className="flex flex-col gap-1 mt-2">
          {q.status !== 'open' && <button type="button" disabled={busy} onClick={() => save({ status: 'open' })} className="text-xs text-indigo-600 text-right">פתיחה מחדש</button>}
          {q.status !== 'closed' && <button type="button" disabled={busy} onClick={() => save({ status: 'closed' })} className="text-xs text-slate-600 text-right">סגירה</button>}
        </div>
      </td>
    </tr>
  );
}
