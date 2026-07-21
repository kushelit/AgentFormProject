'use client';
// components/ImportRunsManager/ImportRunsManager.tsx

import React, { useEffect, useState } from 'react';

type ImportRun = {
  runId: string;
  type: 'elementary' | 'pension_finance' | 'risk';
  targetCollection: string;
  recordsCount: number;
  newCustomerCount: number;
  failedCount: number;
  createdAt: string | null;
  deletedAt: string | null;
};

type Props = {
  agentId: string;
  onClose: () => void;
  /** נקרא אחרי מחיקה מוצלחת, כדי שהמסך הקורא ירענן את הנתונים שלו */
  onDeleted?: () => void;
};

const TYPE_LABELS: Record<string, string> = {
  elementary: 'אלמנטרי',
  pension_finance: 'פנסיה ופיננסים',
  risk: 'סיכונים',
};

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const thStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  background: '#1E5FA8',
  color: '#fff',
  padding: '8px 10px',
  textAlign: 'right',
  fontWeight: 700,
  fontSize: 12,
  whiteSpace: 'nowrap',
  borderBottom: '2px solid #164a80',
};

const ImportRunsManager: React.FC<Props> = ({ agentId, onClose, onDeleted }) => {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchRuns = async () => {
    if (!agentId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/import-runs/list?agentId=${agentId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || 'שגיאה בטעינת הרשימה');
        return;
      }
      setRuns(data.runs || []);
    } catch {
      setError('שגיאה בטעינת הרשימה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRuns(); }, [agentId]);

  const handleDelete = async (run: ImportRun) => {
    const confirmed = confirm(
      `למחוק את הטעינה הזו?\n\nיימחקו ${run.recordsCount} רשומות ו-${run.newCustomerCount} לקוחות חדשים שנוצרו בטעינה זו.\nלא ניתן לבטל פעולה זו.`
    );
    if (!confirmed) return;

    setDeletingId(run.runId);
    try {
      const res = await fetch('/api/import-runs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: run.runId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'שגיאה במחיקה');
        return;
      }
      await fetchRuns();
      onDeleted?.();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}
      onClick={onClose}
    >
      <div
        style={{ width: 720, maxWidth: '95vw', maxHeight: '85vh', background: '#F1F5F7', borderRadius: 8, padding: 20, position: 'relative', direction: 'rtl', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{ position: 'absolute', top: 12, left: 12, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: 'rgba(0,0,0,0.4)' }}
        >
          ✖
        </button>

        <div style={{ fontWeight: 700, color: '#3B6A95', marginBottom: 16, borderBottom: '1px solid #ddd', paddingBottom: 8 }}>
          ניהול טעינות אקסל
        </div>

        {loading && <div style={{ fontSize: 13, color: '#888' }}>טוען...</div>}
        {error && <div style={{ fontSize: 13, color: '#E24B4A', marginBottom: 8, wordBreak: 'break-all' }}>{error}</div>}

        {!loading && !error && runs.length === 0 && (
          <div style={{ fontSize: 13, color: '#888' }}>לא בוצעו עדיין טעינות אקסל לסוכן הזה.</div>
        )}

        {!loading && runs.length > 0 && (
          <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #E8E6DF', borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle }}>תאריך</th>
                  <th style={{ ...thStyle }}>סוג</th>
                  <th style={{ ...thStyle }}>רשומות</th>
                  <th style={{ ...thStyle }}>לקוחות חדשים</th>
                  <th style={{ ...thStyle }}>שורות שנכשלו</th>
                  <th style={{ ...thStyle }}>סטטוס</th>
                  <th style={{ ...thStyle }}></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr key={run.runId} style={{ background: i % 2 === 0 ? '#fff' : '#F5F7FA', borderBottom: '1px solid #E8E6DF' }}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{formatDate(run.createdAt)}</td>
                    <td style={{ padding: '6px 8px' }}>{TYPE_LABELS[run.type] || run.type}</td>
                    <td style={{ padding: '6px 8px' }}>{run.recordsCount}</td>
                    <td style={{ padding: '6px 8px' }}>{run.newCustomerCount}</td>
                    <td style={{ padding: '6px 8px', color: run.failedCount > 0 ? '#E24B4A' : undefined }}>{run.failedCount}</td>
                    <td style={{ padding: '6px 8px' }}>
                      {run.deletedAt ? (
                        <span style={{ color: '#888' }}>נמחקה ({formatDate(run.deletedAt)})</span>
                      ) : (
                        <span style={{ color: '#1E8449' }}>פעילה</span>
                      )}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      {!run.deletedAt && (
                        <button
                          type="button"
                          onClick={() => handleDelete(run)}
                          disabled={deletingId === run.runId}
                          style={{
                            background: '#E24B4A', color: '#fff', border: 'none', borderRadius: 4,
                            padding: '4px 10px', cursor: deletingId === run.runId ? 'not-allowed' : 'pointer', fontSize: 11,
                          }}
                        >
                          {deletingId === run.runId ? 'מוחק...' : 'מחק טעינה'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportRunsManager;