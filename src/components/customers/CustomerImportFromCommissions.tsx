'use client';
// ═══════════════════════════════════════════════════════════════════
// src/components/customers/CustomerImportFromCommissions.tsx
// ייבוא לקוחות מטעינות העמלות — קומפוננטה עצמאית (כפתור + חלון).
// אותן פונקציות ענן כמו בניהול לקוחות:
//   previewCustomerImport → importCustomersFromCommissions → rollbackCustomerImport
// הייבוא האחרון של הסוכן נשמר ב-agentImportState/{agentId}.lastImportRunId
// ═══════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { db, functions } from '@/lib/firebase/firebase';

type PreviewData = {
  previewList: Array<{ customerId: string; fullName: string; firstName: string; lastName: string }>;
  skipped: number;
  total: number;
  toCreate: number;
};

type ImportResult = {
  runId: string;
  created: number;
  skipped: number;
  total: number;
  createdList: Array<{ customerId: string; fullName: string }>;
};

interface Props {
  agentId: string;
  /** נקרא אחרי ייבוא או ביטול ייבוא — לרענון נתונים בדף המארח */
  onChanged?: () => void;
  className?: string;
}

function downloadXlsx(rows: Record<string, any>[], sheet: string, fileName: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  (ws as any)['!rtl'] = true;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), fileName);
}

const Stat: React.FC<{ label: string; value: number; tone: 'gray' | 'green' | 'blue' }> = ({ label, value, tone }) => {
  const cls = {
    gray: 'bg-slate-50 text-slate-800',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-sky-50 text-sky-700',
  }[tone];
  return (
    <div className={`p-3 rounded-xl ${cls}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-2xl font-black">{value.toLocaleString('he-IL')}</div>
    </div>
  );
};

const CustomerImportFromCommissions: React.FC<Props> = ({ agentId, onChanged, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // הייבוא האחרון של הסוכן (לכפתור "בטל ייבוא אחרון")
  useEffect(() => {
    setLastRunId(null);
    if (!agentId) return;
    getDoc(doc(db, 'agentImportState', agentId))
      .then((snap) => setLastRunId(snap.exists() ? snap.data()?.lastImportRunId || null : null))
      .catch(() => setLastRunId(null));
  }, [agentId]);

  const close = () => {
    if (previewLoading || importLoading || rollbackLoading) return;
    setOpen(false);
    setPreviewData(null);
    setImportResult(null);
    setError(null);
  };

  const startPreview = async () => {
    if (!agentId) return;
    setOpen(true);
    setError(null);
    setNotice(null);
    setPreviewData(null);
    setImportResult(null);
    setPreviewLoading(true);
    try {
      const fn = httpsCallable(functions, 'previewCustomerImport');
      const res: any = await fn({ agentId });
      setPreviewData(res.data);
    } catch (e: any) {
      setError(`כשל בתצוגה מקדימה: ${e?.message || ''}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmImport = async () => {
    setImportLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, 'importCustomersFromCommissions');
      const res: any = await fn({ agentId });
      setImportResult(res.data);
      setLastRunId(res.data?.runId || null);
      setPreviewData(null);
      onChanged?.();
    } catch (e: any) {
      setError(`כשל בייבוא לקוחות: ${e?.message || ''}`);
    } finally {
      setImportLoading(false);
    }
  };

  const rollback = async () => {
    if (!lastRunId) return;
    if (!window.confirm('האם למחוק את כל הלקוחות שנוצרו בייבוא זה?')) return;
    setRollbackLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, 'rollbackCustomerImport');
      const res: any = await fn({ runId: lastRunId });
      setNotice(`בוטל הייבוא — נמחקו ${res.data?.deleted ?? 0} לקוחות`);
      setLastRunId(null);
      setImportResult(null);
      setOpen(false);
      onChanged?.();
    } catch (e: any) {
      setError(`כשל בביטול הייבוא: ${e?.message || ''}`);
      setOpen(true);
    } finally {
      setRollbackLoading(false);
    }
  };

  const busy = previewLoading || importLoading;

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          type="button"
          onClick={startPreview}
          disabled={!agentId}
          className="bg-white text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg font-bold hover:bg-indigo-50 transition disabled:opacity-40"
        >
          👥 ייבוא לקוחות מטעינות
        </button>
        {lastRunId && !open && (
          <button
            type="button"
            onClick={rollback}
            disabled={rollbackLoading}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            {rollbackLoading ? 'מבטל…' : 'בטל ייבוא אחרון'}
          </button>
        )}
        {notice && !open && <span className="text-xs text-emerald-700">{notice}</span>}
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" dir="rtl" onClick={close}>
          <div className="bg-white w-[min(680px,96vw)] max-h-[88vh] rounded-2xl shadow-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div className="font-black text-slate-800">ייבוא לקוחות מטעינות</div>
              <button type="button" onClick={close} disabled={busy || rollbackLoading} className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40">
                סגור
              </button>
            </div>

            <div className="p-5 overflow-auto flex-1">
              {error && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

              {busy && (
                <div className="py-10 text-center">
                  <div className="animate-spin text-4xl mb-3 inline-block">⏳</div>
                  <div className="text-slate-600">{previewLoading ? 'טוען תצוגה מקדימה…' : 'מייבא לקוחות, אנא המתיני…'}</div>
                  <div className="text-sm text-slate-400 mt-1">הפעולה עשויה לקחת מספר דקות</div>
                </div>
              )}

              {!busy && previewData && !importResult && (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                    <Stat label="סה״כ נמצאו" value={previewData.total} tone="gray" />
                    <Stat label="ייווצרו חדשים" value={previewData.toCreate} tone="green" />
                    <Stat label="כבר קיימים" value={previewData.skipped} tone="blue" />
                  </div>

                  {previewData.previewList.length > 0 ? (
                    <div className="max-h-[300px] overflow-auto border rounded-xl mb-4">
                      <table className="w-full text-sm text-right">
                        <thead className="sticky top-0 bg-slate-50 text-slate-500 text-xs">
                          <tr>
                            <th className="px-3 py-2">ת״ז</th>
                            <th className="px-3 py-2">שם מלא</th>
                            <th className="px-3 py-2">שם פרטי</th>
                            <th className="px-3 py-2">שם משפחה</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {previewData.previewList.map((r, i) => (
                            <tr key={`${r.customerId}_${i}`}>
                              <td className="px-3 py-1.5 tabular-nums">{r.customerId}</td>
                              <td className="px-3 py-1.5">{r.fullName}</td>
                              <td className="px-3 py-1.5">{r.firstName}</td>
                              <td className="px-3 py-1.5">{r.lastName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="mb-4 p-4 text-center text-sm text-slate-500 bg-slate-50 rounded-xl">
                      כל הלקוחות מהטעינות כבר קיימים בניהול לקוחות.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 justify-center">
                    {previewData.toCreate > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={confirmImport}
                          className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700"
                        >
                          אשר ייבוא ({previewData.toCreate.toLocaleString('he-IL')})
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadXlsx(
                              previewData.previewList.map((r) => ({
                                'תעודת זהות': r.customerId,
                                'שם מלא': r.fullName,
                                'שם פרטי': r.firstName,
                                'שם משפחה': r.lastName,
                              })),
                              'תצוגה מקדימה',
                              'תצוגה_מקדימה_ייבוא.xlsx'
                            )
                          }
                          className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm"
                        >
                          הורד לאקסל
                        </button>
                      </>
                    )}
                    <button type="button" onClick={close} className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold">
                      בטל
                    </button>
                  </div>
                </>
              )}

              {!busy && importResult && (
                <div className="space-y-4 text-center">
                  <div className="text-emerald-600 text-5xl">✓</div>
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="סה״כ נמצאו" value={importResult.total} tone="gray" />
                    <Stat label="נוצרו חדשים" value={importResult.created} tone="green" />
                    <Stat label="כבר קיימים" value={importResult.skipped} tone="blue" />
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {importResult.createdList?.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadXlsx(
                            importResult.createdList.map((r) => ({ 'תעודת זהות': r.customerId, 'שם מלא': r.fullName })),
                            'לקוחות חדשים',
                            'לקוחות_שיובאו.xlsx'
                          )
                        }
                        className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm"
                      >
                        הורד רשימה ({importResult.created.toLocaleString('he-IL')})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={rollback}
                      disabled={rollbackLoading}
                      className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm disabled:opacity-50"
                    >
                      {rollbackLoading ? 'מבטל…' : 'בטל ייבוא (מחק הכל)'}
                    </button>
                    <button type="button" onClick={close} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold">
                      סגור
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CustomerImportFromCommissions;