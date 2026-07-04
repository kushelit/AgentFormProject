'use client';

// ═══════════════════════════════════════════════════════════════════
// הדביקי את הקומפוננטה הזו בתוך דף האדמין שלך, בכל מקום שנוח.
// דרישות:
//   1. ייבוא: import BackfillYmButton from '@/components/admin/BackfillYmButton';
//   2. שימוש: <BackfillYmButton />
// ═══════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase/firebase';

export default function BackfillYmButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    processed: number;
    skipped: number;
    errors: number;
    totalDocsWritten: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    const confirmed = window.confirm(
      'פעולה זו תאכלס את ymCommissionSummaries מנתונים היסטוריים (מרץ 2026+).\n' +
      'היא בטוחה להרצה חוזרת — מסמכים קיימים יידרסו.\n\n' +
      'להמשיך?'
    );
    if (!confirmed) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
 const backfill = httpsCallable(functions, 'backfillYmCommissionSummaries');
const res = await backfill({});
setResult(res.data as any);
} catch (err: any) {
      setError(err.message ?? 'שגיאת רשת');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-white max-w-md" dir="rtl">
      <h3 className="font-bold text-gray-800 mb-1">Backfill — לפי חודש פרסום</h3>
      <p className="text-xs text-gray-500 mb-3">
        אכלוס ymCommissionSummaries מנתונים היסטוריים (מרץ 2026+).
        רץ פעם אחת — לאחר מכן כל ריצה עתידית כותבת אוטומטית.
      </p>

      <button
        onClick={handleClick}
        disabled={loading}
        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
      >
        {loading ? '⏳ מריץ backfill...' : '🔄 הרץ Backfill'}
      </button>

      {loading && (
        <p className="text-xs text-gray-400 mt-2">
          התהליך עשוי לקחת עד כמה דקות — אל תסגרי את הדף.
        </p>
      )}

      {result && (
        <div className="mt-3 text-sm bg-green-50 border border-green-200 rounded p-3">
          <p className="font-bold text-green-700 mb-1">✅ הושלם בהצלחה</p>
          <p>ריצות שעובדו: <strong>{result.processed}</strong></p>
          <p>דולגו: <strong>{result.skipped}</strong></p>
          <p>שגיאות: <strong>{result.errors}</strong></p>
          <p>מסמכים נכתבו: <strong>{result.totalDocsWritten}</strong></p>
        </div>
      )}

      {error && (
        <div className="mt-3 text-sm bg-red-50 border border-red-200 rounded p-3 text-red-700">
          ❌ שגיאה: {error}
        </div>
      )}
    </div>
  );
}
