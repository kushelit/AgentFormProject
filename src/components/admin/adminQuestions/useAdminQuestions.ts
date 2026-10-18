'use client';
// טעינה משותפת של השאלות הפתוחות — בקשה אחת לכל הדף, ורענון לכל התגיות אחרי שינוי.

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import type { AdminQuestion, AdminQuestionsSync } from '@/lib/adminQuestions/types';

type Payload = { questions: AdminQuestion[]; sync: AdminQuestionsSync | null };

let cache: Promise<Payload> | null = null;
const listeners = new Set<() => void>();

function load(): Promise<Payload> {
  if (!cache) {
    cache = apiFetch('/api/admin-questions')
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        return { questions: (j.questions || []) as AdminQuestion[], sync: (j.sync || null) as AdminQuestionsSync | null };
      })
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}

export function refreshAdminQuestions() {
  cache = null;
  listeners.forEach((fn) => fn());
}

export async function postAdminQuestion(body: Record<string, unknown>) {
  const r = await apiFetch('/api/admin-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  refreshAdminQuestions();
  return j;
}

/** enabled=false → לא פונה לשרת בכלל (משתמש שאינו אדמין) */
export function useAdminQuestions(enabled: boolean) {
  const [questions, setQuestions] = useState<AdminQuestion[] | null>(null);
  const [sync, setSync] = useState<AdminQuestionsSync | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    load()
      .then((p) => !cancelled && (setQuestions(p.questions), setSync(p.sync), setError('')))
      .catch((e) => !cancelled && setError(e?.message || 'שגיאה'));
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  return { questions, sync, error };
}
