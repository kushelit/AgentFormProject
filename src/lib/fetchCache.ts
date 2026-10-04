// src/lib/fetchCache.ts
// זיכרון בדפדפן לבקשות POST עם JSON — דריל שכבר נפתח נפתח שוב מיד.
// • בקשה זהה (אותה כתובת + אותו גוף) שכבר בדרך — לא נשלחת פעמיים.
// • נשמר ברמת המודול, כך ששורד מעבר בין לשוניות וסגירה/פתיחה של חלונות.
// • בקשה שנכשלה לא נשמרת.
// • הבקשות נשלחות דרך apiFetch — עם טוקן המשתמש המחובר.

import { onAuthStateChanged } from 'firebase/auth';
import { apiFetch } from '@/lib/apiFetch';
import { auth } from '@/lib/firebase/firebase';

const DEFAULT_TTL_MS = 10 * 60 * 1000;

type Entry = { at: number; promise: Promise<any> };
const store = new Map<string, Entry>();

// • מתנקה כשהמשתמש המחובר מתחלף/מתנתק — כדי שמשתמש לא יקבל נתונים שנשמרו עבור קודמו.
let cacheUid: string | null | undefined;
if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, (user) => {
    const uid = user?.uid ?? null;
    if (cacheUid !== undefined && uid !== cacheUid) store.clear();
    cacheUid = uid;
  });
}

export class FetchError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(data?.error || `HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}

export function postJsonCached<T = any>(
  url: string,
  body: Record<string, any>,
  opts: { ttlMs?: number; force?: boolean } = {}
): Promise<T> {
  const key = `${url}|${JSON.stringify(body)}`;
  const hit = store.get(key);
  if (!opts.force && hit && Date.now() - hit.at < (opts.ttlMs ?? DEFAULT_TTL_MS)) return hit.promise;

  const promise = apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new FetchError(res.status, data);
    return data as T;
  });

  store.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (store.get(key)?.promise === promise) store.delete(key);
  });
  return promise;
}

/** טעינה מוקדמת — בלי לחכות לתוצאה ובלי לזרוק שגיאה */
export function prefetchJson(url: string, body: Record<string, any>) {
  postJsonCached(url, body).catch(() => undefined);
}

/** ניקוי הזיכרון (הכל, או רק כתובות שמתחילות ב-prefix) */
export function clearFetchCache(prefix?: string) {
  if (!prefix) return store.clear();
  Array.from(store.keys()).forEach((k) => k.startsWith(prefix) && store.delete(k));
}
