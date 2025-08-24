// utils/reconcile.ts
export const ym = (d: string) => (d || '').slice(0, 7); // YYYY-MM

// נרמול בעברית + הסרת מירכאות/רווחים
export function normalizeHebrew(s: string | undefined | null) {
  if (!s) return '';
  return String(s)
    .replace(/[“”״"]/g, '')        // מירכאות ישרות/כפולות
    .replace(/'/g, '')             // גרש
    .replace(/\u200f|\u200e/g, '') // סימוני RTL נסתרים
    .replace(/\s+/g, ' ')          // רווחים
    .trim();
}

// מפת שיוכים לשם חברה קנוני (אפשר להחזיק ב-Firestore/MD)
export function makeCompanyCanonical(raw: string) {
  const x = normalizeHebrew(raw);
  const map: Record<string,string> = {
    'מנורה': 'מנורה',
    'מנורה מבטחים': 'מנורה',
    'הפניקס': 'הפניקס',
    'הפניקס חברה לביטוח': 'הפניקס',
    'כלל': 'כלל',
    'אנגליסט': 'אנגליסט',
    // הוסיפי כאן וריאציות נוספות
  };
  return map[x] || x;
}

// חישובי ממוצע/סטיית תקן
export function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a,b)=>a+b,0) / arr.length;
}
export function stdev(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = mean(arr.map(x => (x - m) ** 2));
  return Math.sqrt(v);
}

// קרבה בין סכומים 0..1 (1=זהים)
export function amountSimilarity(a?: number, b?: number) {
  if (typeof a !== 'number' || typeof b !== 'number') return 0;
  if (a === 0 && b === 0) return 1;
  const diff = Math.abs(a - b);
  const denom = Math.max(1, Math.abs(a), Math.abs(b));
  return 1 - (diff / denom); // קטן=קרוב, גדול=רחוק
}
