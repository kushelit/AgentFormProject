'use client';
// תגית "שאלות לחברה" ליד נושא בדף — לאדמין בלבד. לחיצה פותחת חלונית: השאלות של המקום הזה, תשובה, סטטוס, ושאלה חדשה.

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { STATUS_LABEL, type AdminQuestion } from '@/lib/adminQuestions/types';
import { postAdminQuestion, useAdminQuestions } from './useAdminQuestions';
import st from './AdminQuestions.module.css';

type Props = { anchor: string; companyId: string; company: string };

export default function AdminQuestionsBadge({ anchor, companyId, company }: Props) {
  const { detail } = useAuth();
  const isAdmin = detail?.role === 'admin';
  const { questions } = useAdminQuestions(isAdmin);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isAdmin || !questions) return null;
  const here = questions.filter((q) => q.anchor === anchor && q.status !== 'closed');
  const openCount = here.filter((q) => q.status === 'open').length;

  return (
    // לחיצה בתוך התגית לא מפעילה את מה שמסביב (למשל <summary> שפותח/סוגר)
    <span ref={ref} className={st.wrap} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} onKeyDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`${st.badge} ${openCount ? '' : st.badgeQuiet}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {openCount ? `❓ ${openCount} ${openCount === 1 ? 'שאלה' : 'שאלות'} ל${company}` : here.length ? `✓ נענו (${here.length})` : '＋ שאלה'}
      </button>

      {/* מעבר עכבר: נוסח השאלות. לחיצה: החלונית המלאה (תשובה, סטטוס, שאלה חדשה) */}
      {!open && (
        <span className={st.preview} role="tooltip">
          {here.length ? (
            here.map((q) => (
              <span key={q.id} className={st.previewItem}>
                <span className={`${st.status} ${st[`status_${q.status}`]}`}>{STATUS_LABEL[q.status]}</span> {q.question}
                {q.example && <span className={st.previewExample}>דוגמה: {q.example}</span>}
                {q.answer && <span className={st.previewAnswer}>תשובה: {q.answer}</span>}
              </span>
            ))
          ) : (
            <span>אין שאלות כאן. לחיצה להוספה.</span>
          )}
          <span className={st.previewHint}>לחיצה לפתיחה · לאדמין בלבד</span>
        </span>
      )}

      {open && (
        <span className={st.panel} role="dialog" aria-label={`שאלות ל${company}`}>
          <span className={st.panelHead}>
            <b>שאלות ל{company}</b>
            <span className={st.adminOnly}>לאדמין בלבד</span>
          </span>
          {here.length === 0 && !adding && <span className={st.empty}>אין שאלות פתוחות כאן.</span>}
          {here.map((q) => <QuestionItem key={q.id} q={q} />)}
          {adding ? (
            <NewQuestion anchor={anchor} companyId={companyId} company={company} onDone={() => setAdding(false)} />
          ) : (
            <button type="button" className={st.linkBtn} onClick={() => setAdding(true)}>+ שאלה חדשה כאן</button>
          )}
        </span>
      )}
    </span>
  );
}

function QuestionItem({ q }: { q: AdminQuestion }) {
  const [answer, setAnswer] = useState(q.answer);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await postAdminQuestion({ action: 'update', id: q.id, patch });
    } catch (e: any) {
      setErr(e?.message || 'שגיאה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={st.item}>
      <span className={st.itemTop}>
        <span className={`${st.status} ${st[`status_${q.status}`]}`}>{STATUS_LABEL[q.status]}</span>
      </span>
      <span className={st.question}>{q.question}</span>
      {q.example && <span className={st.example}>דוגמה: {q.example}</span>}
      <textarea
        className={st.textarea}
        rows={2}
        placeholder="התשובה שקיבלנו…"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />
      <span className={st.actions}>
        <button type="button" disabled={busy} className={st.primary} onClick={() => save({ answer, status: answer.trim() ? 'answered' : q.status })}>
          {answer.trim() ? 'שמירת תשובה' : 'שמירה'}
        </button>
        {q.status !== 'open' && <button type="button" disabled={busy} className={st.secondary} onClick={() => save({ status: 'open' })}>פתיחה מחדש</button>}
        <button type="button" disabled={busy} className={st.secondary} onClick={() => save({ status: 'closed' })}>סגירה</button>
        {err && <span className={st.err}>{err}</span>}
      </span>
    </span>
  );
}

function NewQuestion({ anchor, companyId, company, onDone }: Props & { onDone: () => void }) {
  const [question, setQuestion] = useState('');
  const [example, setExample] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    setBusy(true);
    setErr('');
    try {
      await postAdminQuestion({ action: 'create', anchor, companyId, company, question, example });
      onDone();
    } catch (e: any) {
      setErr(e?.message || 'שגיאה');
      setBusy(false);
    }
  };

  return (
    <span className={st.item}>
      <textarea className={st.textarea} rows={2} placeholder="השאלה" value={question} onChange={(e) => setQuestion(e.target.value)} autoFocus />
      <textarea className={st.textarea} rows={2} placeholder="דוגמה (סוכן, פוליסה, סכומים) — אופציונלי" value={example} onChange={(e) => setExample(e.target.value)} />
      <span className={st.actions}>
        <button type="button" disabled={busy || !question.trim()} className={st.primary} onClick={create}>הוספה</button>
        <button type="button" disabled={busy} className={st.secondary} onClick={onDone}>ביטול</button>
        {err && <span className={st.err}>{err}</span>}
      </span>
    </span>
  );
}
