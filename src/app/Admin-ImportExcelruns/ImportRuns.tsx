'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import DialogNotification from '@/components/DialogNotification';

interface ImportRun {
  runId: string;
  createdAt: { seconds: number };
  agentName: string;
  agentId: string;
  createdBy: string;
  customersCount: number;
  salesCount: number;
}

const ImportRuns = () => {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<JSX.Element>(<></>);
  const [confirmCallback, setConfirmCallback] = useState<() => void>(() => {});

  const fetchRuns = async () => {
    setLoading(true);
    const snapshot = await getDocs(collection(db, 'importRuns'));

    const data: ImportRun[] = snapshot.docs.map((d) => {
      const docData = d.data();

      return {
        runId: docData.runId || d.id,
        createdAt: docData.createdAt,
        agentName: docData.agentName,
        agentId: docData.agentId,
        createdBy: docData.createdBy,
        customersCount: docData.customersCount ?? 0,
        salesCount: docData.salesCount ?? 0,
      };
    });

    setRuns(data.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds));
    setLoading(false);
  };

  const handleDelete = async (runId: string) => {
    const collectionsToCheck = ['customer', 'sales'];
    const relatedDocs: Record<string, any[]> = { customer: [], sales: [] };

    for (const colName of collectionsToCheck) {
      const snapshot = await getDocs(collection(db, colName));
      const toDelete = snapshot.docs.filter((doc) => doc.data().runId === runId);
      relatedDocs[colName] = toDelete.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: `${data.firstNameCustomer ?? ''} ${data.lastNameCustomer ?? ''}`.trim() || '-',
          idNumber: data.IDCustomer || '-',
          date: data.mounth || null,
          product: data.product || '-',
          company: data.company || '-',
        };
      });
    }

    setDialogContent(
      <div>
        <p>הריצה כוללת את הפריטים הבאים (תצוגה מקדימה):</p>
        <div className="mt-4">
          <div className="mb-4">
            <strong>לקוחות ({relatedDocs.customer.length}):</strong>
            <table className="w-full text-sm mt-2 border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-1">שם לקוח</th>
                  <th className="border p-1">ת&quot;ז</th>
                </tr>
              </thead>
              <tbody>
                {relatedDocs.customer.slice(0, 5).map((cust) => (
                  <tr key={cust.id}>
                    <td className="border p-1">{cust.name}</td>
                    <td className="border p-1">{cust.idNumber}</td>
                  </tr>
                ))}
                {relatedDocs.customer.length > 5 && (
                  <tr>
                    <td colSpan={2} className="text-center text-gray-500 text-xs p-1">
                      ...ועוד {relatedDocs.customer.length - 5} לקוחות
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {relatedDocs.sales.length > 0 && (
            <div className="mb-4">
              <strong>עסקאות ({relatedDocs.sales.length}):</strong>
              <table className="w-full text-sm mt-2 border">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-1">לקוח</th>
                    <th className="border p-1">תאריך</th>
                    <th className="border p-1">מוצר</th>
                    <th className="border p-1">חברה</th>
                  </tr>
                </thead>
                <tbody>
                  {relatedDocs.sales.slice(0, 5).map((sale) => (
                    <tr key={sale.id}>
                      <td className="border p-1">{sale.name}</td>
                      <td className="border p-1">{sale.date ? new Date(sale.date).toLocaleDateString('he-IL') : '-'}</td>
                      <td className="border p-1">{sale.product}</td>
                      <td className="border p-1">{sale.company}</td>
                    </tr>
                  ))}
                  {relatedDocs.sales.length > 5 && (
                    <tr>
                      <td colSpan={4} className="text-center text-gray-500 text-xs p-1">
                        ...ועוד {relatedDocs.sales.length - 5} עסקאות
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-red-600 mt-4">האם למחוק את כל התוכן של ריצה זו? פעולה זו בלתי הפיכה.</p>
      </div>
    );

    setConfirmCallback(() => async () => {
      for (const colName of collectionsToCheck) {
        for (const docToDelete of relatedDocs[colName]) {
          await deleteDoc(doc(db, colName, docToDelete.id));
        }
      }
      await deleteDoc(doc(db, 'importRuns', runId));
      await fetchRuns();
      setDialogOpen(false);
    });

    setDialogOpen(true);
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 text-right">
      <h2 className="text-2xl font-bold mb-6">ניהול ריצות ייבוא</h2>

      {loading ? (
        <p>טוען...</p>
      ) : runs.length === 0 ? (
        <p>אין ריצות להצגה.</p>
      ) : (
        <table className="w-full border text-sm text-right">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2">תאריך</th>
              <th>סוכן</th>
              <th>יוזר מייבא</th>
              <th>לקוחות</th>
              <th>עסקאות</th>
              <th>מחיקה</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.runId} className="border-t hover:bg-gray-50">
                <td className="p-2">
                  {new Date(run.createdAt.seconds * 1000).toLocaleString('he-IL')}
                </td>
                <td>{run.agentName}</td>
                <td>{run.createdBy}</td>
                <td>{run.customersCount}</td>
                <td>{run.salesCount}</td>
                <td>
                  <button
                    onClick={() => handleDelete(run.runId)}
                    className="text-red-600 hover:underline font-medium"
                  >
                    מחק ריצה
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dialogOpen && (
        <DialogNotification
          type="warning"
          title="אישור מחיקת ריצה"
          message={dialogContent}
          onConfirm={confirmCallback}
          onCancel={() => setDialogOpen(false)}
          confirmText="מחק"
          cancelText="ביטול"
        />
      )}
    </div>
  );
};

export default ImportRuns;
