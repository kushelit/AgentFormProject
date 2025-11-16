export const dynamic = 'force-dynamic'; // 🧠 מונע קאשינג אוטומטי

import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function GET() {
  try {
    const snapshot = await admin.firestore().collection('users').get();

    const subscriptions = snapshot.docs
      .map(doc => {
        const data = doc.data();

        return {
          id: doc.id,
          name: data.name,
          email: data.email,
          phone: data.phone,
          lastPaymentDate:
            typeof data.lastPaymentDate?.toDate === 'function'
              ? data.lastPaymentDate.toDate().toLocaleDateString('he-IL')
              : data.lastPaymentDate || '',
          lastPaymentStatus: data.lastPaymentStatus || '',
          subscriptionStatus: data.subscriptionStatus || '',
          isActive: data.isActive ?? true,
          subscriptionId: data.subscriptionId || '',
          transactionId: data.transactionId || '',
          transactionToken : data.transactionToken || '',
          asmachta: data.asmachta || '',
        };
      })
      // ✂️ סינון: רק משתמשים עם subscriptionId לא ריק
      .filter(sub => !!sub.subscriptionId);

    return NextResponse.json(subscriptions);
  } catch (error) {
    // console.error('❌ שגיאה בשליפת מנויים:', error);
    return NextResponse.json(
      { error: 'שגיאה פנימית בשליפת מנויים' },
      { status: 500 }
    );
  }
}
