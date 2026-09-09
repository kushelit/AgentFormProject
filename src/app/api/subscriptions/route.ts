// app/api/subscriptions/route.ts

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function GET() {
  try {
    const snapshot = await admin.firestore().collection('users').get();

    /**
     * שומרים את כל המשתמשים פעם אחת בזיכרון,
     * כדי שלא נבצע query נוסף לכל מנוי.
     */
    const allUsers = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as any,
    }));

    const toDateStr = (value: any) => {
      if (!value) return '';

      if (typeof value?.toDate === 'function') {
        return value.toDate().toLocaleDateString('he-IL');
      }

      if (value instanceof Date) {
        return value.toLocaleDateString('he-IL');
      }

      return String(value);
    };

    const subscriptions = allUsers
      .map(({ id, data }) => {
        /**
         * אצל סוכן, agentId יכול להיות שמור בשדה agentId.
         * אם אין אותו, אנחנו משתמשים ב-UID של בעל המנוי.
         *
         * כך אנחנו תומכים גם במבנים ישנים שבהם
         * הסוכן עצמו הוא ה-agentId.
         */
        const ownerAgentId =
          String(data.agentId || id).trim();

        /**
         * עובד = משתמש שיש לו agentId של הסוכן.
         *
         * לא סופרים את בעל המנוי עצמו,
         * גם במקרה שבו ה-agentId שלו שווה ל-UID שלו.
         */
        const workersCount = allUsers.filter(
          ({ id: userId, data: userData }) => {
            if (userId === id) return false;

            const userAgentId =
              String(userData.agentId || '').trim();

            return (
              userAgentId !== '' &&
              userAgentId === ownerAgentId
            );
          }
        ).length;

        return {
          id,

          agentId: ownerAgentId,

          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          idNumber: data.idNumber || '',
          role: data.role || '',
          isActive: data.isActive ?? true,

          /**
           * מספר עובדים ששייכים לסוכן
           */
          workersCount,

          /**
           * מידע מנוי
           */
          subscriptionType:
            data.subscriptionType || '',

          subscriptionStatus:
            data.subscriptionStatus || '',

          subscriptionId:
            data.subscriptionId || '',

          subscriptionStartDate:
            toDateStr(data.subscriptionStartDate),

          lastPlanChangeDate:
            toDateStr(data.lastPlanChangeDate),

          lastPaymentDate:
            toDateStr(data.lastPaymentDate),

          lastPaymentStatus:
            data.lastPaymentStatus || '',

          totalCharged:
            data.totalCharged ?? null,

          futureChargeAmount:
            data.futureChargeAmount ?? null,

          /**
           * ביטולים / זיכויים
           */
          cancellationDate:
            toDateStr(data.cancellationDate),

          growCancellationStatus:
            data.growCancellationStatus || '',

          wasRefunded:
            data.wasRefunded === true,

          refundDate:
            toDateStr(data.refundDate),

          /**
           * קופון
           *
           * usedCouponCode הוא המבנה הישן.
           * couponUsed הוא המבנה החדש.
           */
          usedCouponCode:
            data.usedCouponCode || '',

          couponUsed: data.couponUsed
            ? {
                code:
                  data.couponUsed.code || '',

                discount:
                  typeof data.couponUsed.discount === 'number'
                    ? data.couponUsed.discount
                    : 0,

                date:
                  toDateStr(data.couponUsed.date),

                appliedAt:
                  toDateStr(data.couponUsed.appliedAt),

                expiresAt:
                  toDateStr(data.couponUsed.expiresAt),

                lastNotifiedAt:
                  toDateStr(data.couponUsed.lastNotifiedAt),

                notifyFlags:
                  data.couponUsed.notifyFlags || {},
              }
            : null,

          /**
           * שיוך לסוכנויות
           */
          agencies:
            data.agencies ?? null,

          /**
           * Grow technical
           */
          transactionId:
            data.transactionId || '',

          transactionToken:
            data.transactionToken || '',

          asmachta:
            data.asmachta || '',

          addOns:
            data.addOns || {
              leadsModule: false,
              extraWorkers: 0,
            },
        };
      })

      /**
       * רק משתמש שבאמת מחזיק מנוי.
       *
       * העובדים עצמם לא יופיעו בטבלת המנויים,
       * אלא רק ישפיעו על workersCount.
       */
      .filter(
        (sub) =>
          !!sub.subscriptionId ||
          !!sub.subscriptionType
      );

    return NextResponse.json(subscriptions);
  } catch (error) {
    console.error(
      '[subscriptions] Failed loading subscriptions:',
      error
    );

    return NextResponse.json(
      {
        error: 'שגיאה פנימית בשליפת מנויים',
      },
      {
        status: 500,
      }
    );
  }
}