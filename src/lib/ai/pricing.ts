// src/lib/ai/pricing.ts
// הערכת עלות של קריאת AI לפי טוקנים — לדף ניטור השימוש ולרישום ב-aiUsageLogs.
// ⚠ זו הערכה. מקור האמת לחיוב הוא דף Cost ב-Console של Anthropic.
// מחירים בדולרים למיליון טוקנים. כשמחליפים מודל (AI_DEFAULT_MODEL) — לעדכן כאן.
// מודל שלא מופיע ברשימה מוערך לפי מחיר ברירת המחדל ומסומן (known: false).

type Price = { input: number; output: number };

const PRICES: Array<{ prefix: string; price: Price }> = [
  { prefix: 'claude-sonnet-4-5', price: { input: 3, output: 15 } },
  { prefix: 'claude-haiku-4-5', price: { input: 1, output: 5 } },
];

const DEFAULT_PRICE: Price = { input: 3, output: 15 };

export function estimateCostUsd(model: string | undefined, inputTokens: number, outputTokens: number) {
  const hit = PRICES.find((p) => String(model ?? '').startsWith(p.prefix));
  const price = hit?.price ?? DEFAULT_PRICE;
  const cost = ((Number(inputTokens) || 0) * price.input + (Number(outputTokens) || 0) * price.output) / 1_000_000;
  return { cost, known: !!hit };
}