// app/api/subscriptions/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function GET() {
  try {
    const snapshot = await admin.firestore().collection('users').get();

    const subscriptions = snapshot.docs
      .map(doc => {
        const data = doc.data() as any;

        const toDateStr = (v: any) =>
          typeof v?.toDate === 'function'
            ? v.toDate().toLocaleDateString('he-IL')
            : v
            ? String(v)
            : '';

        return {
          id: doc.id,
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          idNumber: data.idNumber || '',
          role: data.role || '',
          isActive: data.isActive ?? true,

          // מידע מנוי
          subscriptionType: data.subscriptionType || '',   // basic / pro / enterprise
          subscriptionStatus: data.subscriptionStatus || '',
          subscriptionId: data.subscriptionId || '',       // processId מגראו
          subscriptionStartDate:
          data.subscriptionStartDate?.toDate?.()
            ? data.subscriptionStartDate.toDate().toLocaleDateString('he-IL')
            : '',          
            lastPlanChangeDate:
  data.lastPlanChangeDate?.toDate?.()
    ? data.lastPlanChangeDate.toDate().toLocaleDateString('he-IL')
    : '',
          lastPaymentDate: toDateStr(data.lastPaymentDate),
          lastPaymentStatus: data.lastPaymentStatus || '',
          totalCharged: data.totalCharged ?? null,
          futureChargeAmount: data.futureChargeAmount ?? null,

          // ביטולים / זיכויים
          cancellationDate: toDateStr(data.cancellationDate),
          growCancellationStatus: data.growCancellationStatus || '',
          wasRefunded: data.wasRefunded === true,
          refundDate: toDateStr(data.refundDate),

          // קופון / סוכנויות
          couponUsed: data.couponUsed
  ? {
      code: data.couponUsed.code || '',
      discount: data.couponUsed.discount || 0,
      date: data.couponUsed.date?.toDate?.()
        ? data.couponUsed.date.toDate().toLocaleString('he-IL')
        : ''
    }
  : null,
          agencies: data.agencies ?? null,

          // Grow technical
          transactionId: data.transactionId || '',
          transactionToken: data.transactionToken || '',
          asmachta: data.asmachta || '',
          addOns: data.addOns || { leadsModule: false, extraWorkers: 0 },
        };
      })
      // רק מי שיש לו subscriptionId או subscriptionType (כלומר באמת מנוי)
      .filter(sub => !!sub.subscriptionId || !!sub.subscriptionType);

    return NextResponse.json(subscriptions);
  } catch (error) {
    return NextResponse.json(
      { error: 'שגיאה פנימית בשליפת מנויים' },
      { status: 500 }
    );
  }
}
