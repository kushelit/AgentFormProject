// /app/admin/mfa/page.tsx
'use client';

import { useState } from 'react';
import { getAuth } from 'firebase/auth';

type MfaFactor = {
  uid: string;
  displayName?: string | null;
  factorId?: string;
  phoneNumber?: string | null;
};

const maskPhone = (e164?: string | null) => {
  if (!e164) return '';
  return e164.replace(/^(\+\d{2,3}\d{2})(\d+)(\d{2})$/, (_m, a, mid, z) => `${a}${'*'.repeat(mid.length)}${z}`);
};

export default function AdminMfaPage() {
  const [queryType, setQueryType] = useState<'email' | 'uid'>('email');
  const [query, setQuery] = useState('');
  const [userUid, setUserUid] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const getIdToken = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error('לא מחובר/ת. התחברי כאדמין.');
    return user.getIdToken(/* forceRefresh? */);
  };

  const callApi = async (input: RequestInfo, init?: RequestInit) => {
    const token = await getIdToken();
    return fetch(input, {
      ...(init || {}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
  };

  const loadUser = async () => {
    setErr(''); setMsg(''); setLoading(true);
    try {
      const q = queryType === 'email'
        ? `/api/admin/mfa?email=${encodeURIComponent(query)}`
        : `/api/admin/mfa?uid=${encodeURIComponent(query)}`;
      const res = await callApi(q);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בטעינת משתמש');
      setUserUid(data.uid);
      setUserEmail(data.email);
      setFactors(data.mfa || []);
      setMsg('✅ נטען משתמש וגורמי MFA');
    } catch (e: any) {
      setErr(e.message);
      setUserUid(null);
      setUserEmail(null);
      setFactors([]);
    } finally {
      setLoading(false);
    }
  };

  const removeAll = async () => {
    if (!userUid && !userEmail) return;
    setErr(''); setMsg(''); setLoading(true);
    try {
      const body = queryType === 'email' ? { action: 'removeAll', email: userEmail } : { action: 'removeAll', uid: userUid };
      const res = await callApi('/api/admin/mfa', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בביטול MFA');
      setMsg('🧹 בוטלו כל גורמי ה‑MFA למשתמש');
      setFactors(data.mfa || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const removeOne = async (mfaUid: string) => {
    setErr(''); setMsg(''); setLoading(true);
    try {
      const body = queryType === 'email'
        ? { action: 'remove', email: userEmail, mfaUid }
        : { action: 'remove', uid: userUid, mfaUid };
      const res = await callApi('/api/admin/mfa', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בהסרת גורם');
      setMsg('❌ גורם הוסר');
      setFactors(data.mfa || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const addPhone = async () => {
    if (!userUid && !userEmail) return;
    const phoneNumber = prompt('מספר בפורמט E.164 (למשל +972501234567):') || '';
    if (!phoneNumber) return;
    const displayName = prompt('שם תצוגה (אופציונלי):') || undefined;

    setErr(''); setMsg(''); setLoading(true);
    try {
      const body = queryType === 'email'
        ? { action: 'add', email: userEmail, phoneNumber, displayName }
        : { action: 'add', uid: userUid, phoneNumber, displayName };
      const res = await callApi('/api/admin/mfa', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בהוספת גורם');
      setMsg('➕ נוסף גורם טלפון למשתמש');
      setFactors(data.mfa || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: '24px auto', direction: 'rtl' }}>
      <h1 className="text-2xl font-bold mb-4">ניהול MFA למשתמשים</h1>

      <div className="flex gap-2 items-center">
        <select
          value={queryType}
          onChange={e => setQueryType(e.target.value as 'email' | 'uid')}
          className="border border-gray-300 rounded px-2 py-2"
        >
          <option value="email">חפש לפי אימייל</option>
          <option value="uid">חפש לפי UID</option>
        </select>

        <input
          placeholder={queryType === 'email' ? 'name@example.com' : 'UID_ABC123'}
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 border border-gray-300 rounded px-3 py-2"
        />

        <button onClick={loadUser} disabled={loading || !query} className="bg-blue-900 text-white px-4 py-2 rounded">
          חיפוש
        </button>

        <button onClick={addPhone} disabled={loading || !userUid} className="border px-4 py-2 rounded">
          ➕ הוסף טלפון
        </button>

        <button onClick={removeAll} disabled={loading || !userUid} className="border px-4 py-2 rounded">
          🧹 בטל MFA
        </button>
      </div>

      {loading && <div className="mt-3">טוען…</div>}
      {msg && <div className="mt-3 text-green-700">{msg}</div>}
      {err && <div className="mt-3 text-red-700">{err}</div>}

      {userUid && (
        <div className="mt-4 text-sm text-gray-600">
          <div><span className="font-semibold">UID:</span> {userUid}</div>
          <div><span className="font-semibold">Email:</span> {userEmail || '—'}</div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="font-semibold mb-2">גורמים רשומים</h2>
        {factors.length === 0 ? (
          <div>אין גורמים</div>
        ) : (
          <ul className="space-y-2">
            {factors.map((f) => (
              <li key={f.uid} className="flex items-center justify-between border rounded px-3 py-2">
                <div>
                  <div className="font-medium">{f.displayName || 'טלפון'}</div>
                  <div className="text-sm text-gray-600">{maskPhone(f.phoneNumber)}</div>
                  <div className="text-xs text-gray-400">Factor: {f.factorId} | UID: {f.uid}</div>
                </div>
                <button onClick={() => removeOne(f.uid)} className="text-red-700 hover:underline">
                  הסרה
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
