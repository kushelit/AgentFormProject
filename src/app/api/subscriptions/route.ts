// app/api/subscriptions/route.ts

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function GET() {
  try {
    const snapshot = await admin
      .firestore()
      .collection('users')
      .get();

    /**
     * כל המשתמשים במערכת.
     * נשמור אותם פעם אחת בזיכרון,
     * כדי לחשב עובדים בלי לבצע query נוסף לכל סוכן.
     */
    const allUsers = snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as any,
    }));

    const toDateStr = (value: any) => {
      if (!value) return '';

      if (typeof value?.toDate === 'function') {
        return value
          .toDate()
          .toLocaleDateString('he-IL');
      }

      if (value instanceof Date) {
        return value.toLocaleDateString('he-IL');
      }

      return String(value);
    };

    const subscriptions = allUsers
      .map(({ id, data }) => {
        /**
         * חשוב:
         *
         * אצלנו מזהה הסוכן הוא ה-UID של מסמך המשתמש שלו.
         *
         * עובד שייך לסוכן כאשר:
         *
         * worker.agentId === agent.id
         */
        const agentId = id;

        /**
         * כל העובדים ששייכים לסוכן הזה.
         *
         * בעל המנוי עצמו לא נספר.
         */
        const workers = allUsers
          .filter(({ id: userId, data: userData }) => {
            if (userId === id) {
              return false;
            }

            const workerAgentId = String(
              userData.agentId || ''
            ).trim();

            return workerAgentId === agentId;
          })
          .map(({ id: workerId, data: workerData }) => ({
            id: workerId,

            name:
              workerData.name || '',

            email:
              workerData.email || '',

            phone:
              workerData.phone || '',

            idNumber:
              workerData.idNumber || '',

            role:
              workerData.role || '',

            isActive:
              workerData.isActive ?? true,

            agentId:
              workerData.agentId || '',

            agencies:
              workerData.agencies ?? null,
          }));

        const workersCount = workers.length;

        return {
          /**
           * משתמש בעל המנוי
           */
          id,

          /**
           * במקרה של בעל מנוי / סוכן,
           * agentId הוא ה-UID שלו.
           */
          agentId,

          name:
            data.name || '',

          email:
            data.email || '',

          phone:
            data.phone || '',

          idNumber:
            data.idNumber || '',

          role:
            data.role || '',

          isActive:
            data.isActive ?? true,

          /**
           * עובדים של הסוכן
           */
          workersCount,

          workers,

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
            toDateStr(
              data.subscriptionStartDate
            ),

          lastPlanChangeDate:
            toDateStr(
              data.lastPlanChangeDate
            ),

          lastPaymentDate:
            toDateStr(
              data.lastPaymentDate
            ),

          lastPaymentStatus:
            data.lastPaymentStatus || '',

          totalCharged:
            data.totalCharged ?? null,

          futureChargeAmount:
            data.futureChargeAmount ?? null,

          /**
           * ביטול / זיכוי
           */
          cancellationDate:
            toDateStr(
              data.cancellationDate
            ),

          growCancellationStatus:
            data.growCancellationStatus || '',

          wasRefunded:
            data.wasRefunded === true,

          refundDate:
            toDateStr(
              data.refundDate
            ),

          /**
           * קופון
           */
          usedCouponCode:
            data.usedCouponCode || '',

          couponUsed:
            data.couponUsed
              ? {
                  code:
                    data.couponUsed.code || '',

                  discount:
                    typeof data.couponUsed.discount ===
                    'number'
                      ? data.couponUsed.discount
                      : 0,

                  date:
                    toDateStr(
                      data.couponUsed.date
                    ),

                  appliedAt:
                    toDateStr(
                      data.couponUsed.appliedAt
                    ),

                  expiresAt:
                    toDateStr(
                      data.couponUsed.expiresAt
                    ),

                  lastNotifiedAt:
                    toDateStr(
                      data.couponUsed.lastNotifiedAt
                    ),

                  notifyFlags:
                    data.couponUsed.notifyFlags || {},
                }
              : null,

          /**
           * סוכנויות
           */
          agencies:
            data.agencies ?? null,

          /**
           * Grow
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
       * במסך המנויים מציגים רק בעלי מנוי.
       *
       * העובדים לא מופיעים כשורות נפרדות,
       * אבל כן מוחזרים תחת workers.
       */
      .filter(
        (sub) =>
          Boolean(sub.subscriptionId) ||
          Boolean(sub.subscriptionType)
      );

    return NextResponse.json(
      subscriptions
    );
  } catch (error) {
    console.error(
      '[subscriptions] Failed loading subscriptions:',
      error
    );

    return NextResponse.json(
      {
        error:
          'שגיאה פנימית בשליפת מנויים',
      },
      {
        status: 500,
      }
    );
  }
}