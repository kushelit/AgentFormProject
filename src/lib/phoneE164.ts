// src/lib/phoneE164.ts
// Israeli-oriented phone normalization to E.164 (+972...). Same rules as create-subscription.

export function normalizePhoneE164(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let s = String(raw).replace(/[\s\-()]/g, '').trim();
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+972')) return s;
  if (s.startsWith('972')) return '+' + s;
  if (s.startsWith('0')) return '+972' + s.slice(1);
  if (s.startsWith('+')) return s;
  if (/^\d{9,10}$/.test(s)) {
    if (s.length === 10 && s.startsWith('0')) s = s.slice(1);
    return '+972' + s;
  }
  return undefined;
}
