// ═══════════════════════════════════════════════════════════════════
// src/lib/ai/client.ts
// עטיפה אחת לכל קריאות ה-AI במערכת (צד שרת בלבד).
//
// • מפתח: ANTHROPIC_API_KEY (אחד לכל סביבה — פיתוח / פרודקשן; מומלץ Workspace נפרד לכל סביבה ב-Console)
//   כל רישום כולל keyHint (4 התווים האחרונים של המפתח) — כדי לדעת באיזה מפתח נעשה שימוש
// • מודל ברירת מחדל: AI_DEFAULT_MODEL, אחרת claude-sonnet-4-5
//   פיצ'ר שצריך מודל אחר — מעביר model בקריאה.
// • כל קריאה נרשמת ב-aiUsageLogs עם שם הפיצ'ר, טוקנים וזמן —
//   כך רואים עלות לפי מודול בלי מפתח נפרד לכל מודול.
// • שגיאות אחידות (AiError) עם הודעה ברורה.
// ═══════════════════════════════════════════════════════════════════

import { admin } from '@/lib/firebase/firebase-admin';
import { estimateCostUsd } from '@/lib/ai/pricing';

export const DEFAULT_MODEL = process.env.AI_DEFAULT_MODEL || 'claude-sonnet-4-5';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const USAGE_COLLECTION = 'aiUsageLogs';

export type AiMessage = { role: 'user' | 'assistant'; content: string | any[] };

export type CallClaudeParams = {
  /** שם הפיצ'ר — לרישום עלויות. למשל: 'parse-policy', 'agent-insights' */
  feature: string;
  system?: string;
  messages: AiMessage[];
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** מידע נוסף לרישום (agentId וכו'). לא להכניס תוכן רגיש */
  meta?: Record<string, string | number | boolean | null | undefined>;
};

export type CallClaudeResult = {
  text: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  ms: number;
};

export type AiErrorCode = 'not_configured' | 'api_error' | 'timeout' | 'network' | 'empty';

export class AiError extends Error {
  code: AiErrorCode;
  status?: number;
  constructor(code: AiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
  }
}

async function logUsage(entry: Record<string, any>) {
  try {
    await admin
      .firestore()
      .collection(USAGE_COLLECTION)
      .add({ ...entry, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  } catch (e) {
    console.error('[ai] usage log failed', e);
  }
}

export async function callClaude(p: CallClaudeParams): Promise<CallClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiError('not_configured', 'ANTHROPIC_API_KEY לא מוגדר בשרת');

  const model = p.model || DEFAULT_MODEL;
  const started = Date.now();
  const baseLog = { feature: p.feature, model, keyHint: apiKey.slice(-4), ...(p.meta ?? {}) };

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(p.timeoutMs ?? 55000),
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: p.maxTokens ?? 1500,
        ...(p.system ? { system: p.system } : {}),
        messages: p.messages,
      }),
    });
  } catch (e: any) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    await logUsage({ ...baseLog, ok: false, error: timeout ? 'timeout' : 'network', ms: Date.now() - started });
    throw new AiError(timeout ? 'timeout' : 'network', timeout ? 'המודל לא הגיב בזמן' : `שגיאת רשת: ${e?.message ?? e}`);
  }

  if (!res.ok) {
    const raw = await res.text();
    let msg = raw.slice(0, 300);
    try {
      msg = JSON.parse(raw)?.error?.message || msg;
    } catch {
      // טקסט גולמי
    }
    await logUsage({ ...baseLog, ok: false, error: `http_${res.status}`, detail: msg, ms: Date.now() - started });
    throw new AiError('api_error', `Anthropic ${res.status} (model: ${model}): ${msg}`, res.status);
  }

  const data = await res.json();
  const text: string = (data?.content ?? [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('');
  const usage = {
    input_tokens: Number(data?.usage?.input_tokens ?? 0),
    output_tokens: Number(data?.usage?.output_tokens ?? 0),
  };
  const ms = Date.now() - started;

  const { cost } = estimateCostUsd(model, usage.input_tokens, usage.output_tokens);
  await logUsage({
    ...baseLog,
    ok: !!text.trim(),
    ...usage,
    estimatedCostUsd: Math.round(cost * 1e6) / 1e6,
    ms,
    ...(text.trim() ? {} : { error: 'empty' }),
  });

  if (!text.trim()) throw new AiError('empty', 'המודל החזיר תשובה ריקה');

  return { text, model, usage, ms };
}

/** חילוץ JSON מתשובת מודל — מתעלם מ-```json ומטקסט לפני/אחרי */
export function extractJson<T = any>(text: string): T {
  const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const firstObj = clean.indexOf('{');
  const firstArr = clean.indexOf('[');
  const isArr = firstArr >= 0 && (firstObj < 0 || firstArr < firstObj);
  const start = isArr ? firstArr : firstObj;
  const end = isArr ? clean.lastIndexOf(']') : clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON found in model response');
  return JSON.parse(clean.slice(start, end + 1)) as T;
}