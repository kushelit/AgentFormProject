// src/services/logRegistrationIssue.ts

import { admin } from '@/lib/firebase/firebase-admin';
import type { RegistrationSource, RegistrationReason } from '@/enums/registration';

// 🧩 טיפוס מרוכז
type Params = {
    email: string;
    name: string;
    phone?: string;              // ✅ חדש
    fullName?: string;           // ✅ אם את משתמשת בו
    idNumber?: string;           // ✅ אם את שולחת אותו
    type: 'agent' | 'worker';
    agentId?: string;
    reason: RegistrationReason;
    source: RegistrationSource;
    subscriptionType?: string;   // ✅ אם את משתמשת בזה
    transactionId?: string | null;
    processId?: string | null;
    pageCode?: string | null;
    couponCode?: string | null;
    addOns?: any;
    additionalInfo?: Record<string, any>;
  };

// ✅ שימוש בטיפוס
export const logRegistrationIssue = async ({
  email,
  name,
  type,
  agentId,
  reason,
  source,
  additionalInfo = {},
}: Params) => {
  try {
    const db = admin.firestore();
    await db.collection('registrationIssues').add({
      email,
      name,
      type,
      agentId: agentId || null,
      reason,
      source,
      status: 'open',
      additionalInfo,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`📌 רישום בעיה מסוג '${reason}' ל-${type} נשמר בהצלחה`);
  } catch (err) {
    console.error('❌ שגיאה בשמירת רישום בעיה:', err);
  }
};
