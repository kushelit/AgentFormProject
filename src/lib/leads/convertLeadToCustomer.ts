// המרת ליד ללקוח — פונקציה משותפת לדף הלידים (NewLeads) ולדף הליד (NewLeads/[id]).
// יוצרת רשומת customer ומעבירה אליה את ההערות, המשימות והמסמכים של הליד,
// ומעדכנת את סטטוס הליד ל"הפך ללקוח".

import {
  collection, query, where, getDocs, setDoc, addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

export interface ConvertibleLead {
  id: string;
  AgentId?: string;
  firstNameCustomer?: string;
  lastNameCustomer?: string;
  IDCustomer?: string;
  idCardIssueDate?: string;
  birthday?: string;
  gender?: string;
  phone?: string;
  mail?: string;
  address?: string;
  notes?: string;
  sourceValue?: string;
}

export type ConvertLeadResult =
  | { ok: true; customerId: string; statusUpdated: boolean }
  | { ok: false; error: string };

export const CONVERTED_STATUS_NAME = 'הפך ללקוח';

const mapGenderToHebrew = (g?: string): string => {
  if (g === 'male') return 'זכר';
  if (g === 'female') return 'נקבה';
  return '';
};

/** בדיקות לפני המרה — מחזיר הודעת שגיאה, או null אם אפשר להמיר */
export const validateLeadForConversion = (lead: ConvertibleLead): string | null => {
  if (!lead.AgentId) return 'ליד חסר סוכן – לא ניתן להמיר';
  if (!lead.IDCustomer || !lead.firstNameCustomer || !lead.lastNameCustomer) {
    return 'להמרה ללקוח נדרשים: שם פרטי, שם משפחה ותעודת זהות';
  }
  return null;
};

export async function convertLeadToCustomer(
  lead: ConvertibleLead,
  statusLeadMap: { id: string; statusLeadName: string }[],
): Promise<ConvertLeadResult> {
  const validationError = validateLeadForConversion(lead);
  if (validationError) return { ok: false, error: validationError };
  const agentId = lead.AgentId!;

  // בדיקת קיום לקוח
  const existSnap = await getDocs(query(
    collection(db, 'customer'),
    where('IDCustomer', '==', lead.IDCustomer),
    where('AgentId', '==', agentId),
  ));
  if (!existSnap.empty) return { ok: false, error: 'לקוח עם תז זה כבר קיים במערכת' };

  // יצירת רשומת customer
  const customerRef = doc(collection(db, 'customer'));
  await setDoc(customerRef, {
    AgentId: agentId,
    firstNameCustomer: lead.firstNameCustomer || '',
    lastNameCustomer: lead.lastNameCustomer || '',
    fullNameCustomer: `${lead.firstNameCustomer || ''} ${lead.lastNameCustomer || ''}`.trim(),
    IDCustomer: lead.IDCustomer,
    parentID: customerRef.id,
    phone: lead.phone || '',
    mail: lead.mail || '',
    address: lead.address || '',
    birthday: lead.birthday || '',
    issueDay: lead.idCardIssueDate || '',
    gender: mapGenderToHebrew(lead.gender),
    notes: lead.notes || '',
    sourceValue: lead.sourceValue || '',
    sourceLead: lead.sourceValue || '',
    convertedFromLeadId: lead.id,
    createdAt: serverTimestamp(),
    lastUpdateDate: serverTimestamp(),
  });

  // ── Migration הערות ──
  const notesSnap = await getDocs(query(
    collection(db, 'customerNotes'),
    where('customerId', '==', lead.id),
    where('agentId', '==', agentId),
  ));
  for (const n of notesSnap.docs) {
    await updateDoc(n.ref, { customerId: customerRef.id });
  }

  // ── Migration משימות ──
  const tasksSnap = await getDocs(query(
    collection(db, 'customerTasks'),
    where('customerId', '==', lead.id),
    where('agentId', '==', agentId),
  ));
  for (const t of tasksSnap.docs) {
    await updateDoc(t.ref, { customerId: customerRef.id });
  }

  // ── Migration מסמכים ──
  const docsSnap = await getDocs(query(
    collection(db, 'leadDocuments'),
    where('leadId', '==', lead.id),
  ));
  for (const d of docsSnap.docs) {
    // מוסיפים רשומה חדשה ב-customerDocuments עם אותם נתוני קובץ
    await addDoc(collection(db, 'customerDocuments'), {
      ...d.data(),
      customerId: customerRef.id,
      AgentId: agentId,
      convertedFromLeadDocId: d.id,
      createdAt: serverTimestamp(),
    });
  }

  // ── עדכון סטטוס הליד ──
  // אם הסטטוס "הפך ללקוח" לא נמצא ברשימה — לא דורסים את הסטטוס הקיים בערך ריק
  const convertedStatus = statusLeadMap.find(s => s.statusLeadName === CONVERTED_STATUS_NAME)?.id;
  await updateDoc(doc(db, 'leads', lead.id), {
    ...(convertedStatus ? { selectedStatusLead: convertedStatus } : {}),
    lastUpdateDate: serverTimestamp(),
  });

  return { ok: true, customerId: customerRef.id, statusUpdated: !!convertedStatus };
}
