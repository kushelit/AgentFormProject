// src/hooks/useAgentInsights.ts
// טוען את נתוני הסקירה (/api/agent-insights) ואחריהם את סקירת ה-AI.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentInsights, AiSummary } from '@/types/agentInsights';
import { normalizeInsights } from '@/lib/insights/normalizeInsights';
import { postJsonCached } from '@/lib/fetchCache';

const AI_ERRORS: Record<string, string> = {
  ai_not_configured: 'סקירת AI לא הוגדרה בשרת (חסר מפתח API).',
  insights_not_ready: 'הנתונים עדיין בטעינה — נסי שוב בעוד רגע.',
  no_data: 'אין מספיק נתונים לסקירה.',
};

export default function useAgentInsights(agentId: string, year: string) {
  const [insights, setInsights] = useState<AgentInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ai, setAi] = useState<AiSummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const reqRef = useRef(0);

  const loadAi = useCallback(
    async (force = false, reqId = reqRef.current) => {
      if (!agentId || !year) return;
      setAiLoading(true);
      setAiError(null);
      try {
        const res = await fetch('/api/agent-insights/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, year, force }),
        });
        const data = await res.json().catch(() => ({}));
        if (reqId !== reqRef.current) return;
        if (!res.ok) {
          const base = AI_ERRORS[data?.error] || 'לא הצלחנו ליצור סקירה כרגע.';
          setAiError(data?.detail ? `${base} (${data.detail})` : base);
          return;
        }
        setAi(data as AiSummary);
      } catch (e: any) {
        if (reqId === reqRef.current) setAiError(`לא הצלחנו ליצור סקירה כרגע. (${String(e?.message ?? e)})`);
      } finally {
        if (reqId === reqRef.current) setAiLoading(false);
      }
    },
    [agentId, year]
  );

  useEffect(() => {
    const reqId = ++reqRef.current;
    setInsights(null);
    setAi(null);
    setError(null);
    setAiError(null);
    setAiLoading(false);

    if (!agentId || !year) {
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const data = normalizeInsights(await postJsonCached('/api/agent-insights', { agentId, year }));
        if (reqId !== reqRef.current) return;
        setInsights(data);
        setLoading(false);
        loadAi(false, reqId);
      } catch {
        if (reqId !== reqRef.current) return;
        setError('לא הצלחנו לטעון את נתוני הסקירה.');
        setLoading(false);
      }
    })();
  }, [agentId, year, loadAi]);

  return {
    insights,
    loading,
    error,
    ai,
    aiLoading,
    aiError,
    refreshAi: () => loadAi(true),
  };
}
