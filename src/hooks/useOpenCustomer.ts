// src/hooks/useOpenCustomer.ts
// פתיחת כרטיס לקוח מתוך דרילים שיש בהם רק ת"ז (בלי מזהה מסמך הלקוח).
// מחפש ב-customer לפי סוכן + ת"ז (כל הווריאציות: עם/בלי 0 מוביל, 9 ספרות),
// ופותח /customers/{docId} — כמו הלחיצה על שורה בניהול לקוחות.
// לקוח שלא נמצא / אין הרשאת CRM → לא מנווטים; מחזירים issue שהדריל מציג
// (עם הפניה לייבוא לקוחות מטעינות).
import { useCallback, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { usePermission } from '@/hooks/usePermission';

const CUSTOMER_PAGE = (docId: string) => `/customers/${docId}`;

/** true = כרטיס הלקוח נפתח בלשונית חדשה (הדרילים הם חלונות צפים — שומר על המצב שלהם) */
const OPEN_IN_NEW_TAB = true;

const digits = (v: any) => String(v ?? '').trim().replace(/\D/g, '');
const stripZeros = (v: string) => v.replace(/^0+/, '');

/** אותה לוגיקה כמו idVariants בניהול לקוחות */
export function idVariants(v: any): string[] {
  const d = digits(v);
  if (!d) return [];
  return Array.from(new Set([d, d.padStart(9, '0'), stripZeros(d)].filter(Boolean)));
}

export type CustomerIssue = {
  reason: 'not_found' | 'no_access';
  customerId: string;
  name: string;
};

export default function useOpenCustomer(agentId: string) {
  const { canAccess: canAccessCrm } = usePermission('access_crm_module');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [issue, setIssue] = useState<CustomerIssue | null>(null);
  const cacheRef = useRef(new Map<string, string | null>()); // ת"ז קנונית → docId (null = לא נמצא)

  const openCustomer = useCallback(
    async (customerId: string, name = '') => {
      const canon = stripZeros(digits(customerId));
      if (!agentId || !canon) return;
      setIssue(null);

      if (!canAccessCrm) {
        setIssue({ reason: 'no_access', customerId, name });
        return;
      }

      const cacheKey = `${agentId}|${canon}`;
      let docId = cacheRef.current.get(cacheKey);

      if (docId === undefined) {
        setPendingId(canon);
        try {
          const snap = await getDocs(
            query(
              collection(db, 'customer'),
              where('AgentId', '==', agentId),
              where('IDCustomer', 'in', idVariants(customerId).slice(0, 10))
            )
          );
          docId = snap.docs[0]?.id ?? null;
          // "לא נמצא" לא נשמר — אחרי ייבוא לקוחות ננסה שוב
          if (docId) cacheRef.current.set(cacheKey, docId);
        } catch {
          docId = null;
        } finally {
          setPendingId(null);
        }
      }

      if (!docId) {
        setIssue({ reason: 'not_found', customerId, name });
        return;
      }

      const url = CUSTOMER_PAGE(docId);
      if (OPEN_IN_NEW_TAB) window.open(url, '_blank', 'noopener');
      else window.location.assign(url);
    },
    [agentId, canAccessCrm]
  );

  const isPending = (customerId: string) => !!pendingId && pendingId === stripZeros(digits(customerId));

  return { openCustomer, isPending, issue, clearIssue: () => setIssue(null) };
}