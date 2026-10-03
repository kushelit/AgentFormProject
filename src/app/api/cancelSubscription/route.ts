// File: /app/api/cancelSubscription/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';
import { GROW_ENDPOINTS } from '@/lib/growApi';
import { GROW_USER_ID } from '@/lib/env';
import { guardSelfOrAdmin } from '@/lib/server/auth';
import { sendCancelSubscriptionEmail } from '@/lib/server/sendAppEmail';


export async function POST(req: NextRequest) {
  try {
    const {
      id,
      subscriptionId,
      transactionToken,
      transactionId,
      asmachta,
      updates,
      sendCancelEmail
    } = await req.json();
    const denied = await guardSelfOrAdmin(req, id, 'cancelSubscription');
    if (denied) return denied;

    const db = admin.firestore();
    let userDocRef = null;
    let userData = null;

    // שליפת פרטי המשתמש
    if (id) {
      userDocRef = db.collection('users').doc(id);
      const userSnap = await userDocRef.get();
      userData = userSnap.data();
    } else if (subscriptionId) {
      const snapshot = await db.collection('users').where('subscriptionId', '==', subscriptionId).get();
      if (!snapshot.empty) {
        userDocRef = snapshot.docs[0].ref;
        userData = snapshot.docs[0].data();
      } else {
        return NextResponse.json({ error: 'User not found for subscriptionId' }, { status: 404 });
      }
    }

    if (!userDocRef || !userData) {
      return NextResponse.json({ error: 'Missing user data' }, { status: 400 });
    }

    const userEmail = userData.email;
    const userName = userData.name;
    const subscriptionStartDate = userData?.subscriptionStartDate?.toDate?.() || null;
    const totalCharged = userData?.totalCharged || null;
    const wasRefundedBefore = userData?.wasRefunded === true;

    let growCanceled = false;
    let growMessage = '';

    // קביעת החזרים לפי טווח ימים
    let shouldRefund = false;
    let shouldCancelDirectDebit = false;

    if (subscriptionStartDate && totalCharged) {
      const daysSinceStart = (Date.now() - subscriptionStartDate.getTime()) / (1000 * 60 * 60 * 24);
      shouldRefund = daysSinceStart >= 0 && daysSinceStart <= 14 && !wasRefundedBefore;
      // console.log('📆 Days since subscription started:', daysSinceStart);
      // console.log('💰 totalCharged:', totalCharged);
      shouldCancelDirectDebit = true;
    }

    if (transactionToken && transactionId && asmachta && shouldCancelDirectDebit) {
      const formData = new URLSearchParams();
      // formData.append('userId', '8f215caa9b2a3903');
      formData.append('userId', GROW_USER_ID);
      formData.append('transactionToken', transactionToken);
      formData.append('transactionId', transactionId);
      formData.append('asmachta', asmachta);
      formData.append('changeStatus', '2');

      // console.log('🔍 Params sent to Grow (DirectDebit Cancel):');
      // formData.forEach((value, key) => console.log(`${key} = ${value}`));

      const { data } = await axios.post(
        // 'https://sandbox.meshulam.co.il/api/light/server/1.0/updateDirectDebit',
        GROW_ENDPOINTS.updateDirectDebit,
        formData,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

//       console.log('🔁 Grow cancel result:', data);
// console.log('🔁 data status:', data?.status);
      if (data?.status === 1) {
        // console.log('✅ Grow cancellation successful');
        growCanceled = true;

        if (shouldRefund && totalCharged) {
          // console.log('💸 Processing refund for Grow subscription');
          const refundForm = new URLSearchParams();
          // refundForm.append('userId', '8f215caa9b2a3903');
          refundForm.append('userId', GROW_USER_ID);
          refundForm.append('transactionToken', transactionToken);
          refundForm.append('transactionId', transactionId);
          refundForm.append('refundSum', totalCharged.toString()); // ללא הכפלה
          refundForm.append('stopDirectDebit', '1');
          refundForm.append('cField4', 'manual-upgrade'); // ✅ סימון המקור

          try {
            // console.log('🧾 Sending refund to Grow:', {
            //   transactionToken,
            //   transactionId,
            //   refundSum: Math.round(totalCharged).toString(),
            // });
            
            const refundRes = await axios.post(
              // 'https://sandbox.meshulam.co.il/api/light/server/1.0/refundTransaction',
              GROW_ENDPOINTS.refundTransaction,
              refundForm,
              { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
              
            );
            // console.log('🔁 Grow refund result:', refundRes.data);


            const growRefundResponse = refundRes.data;
   
  // 🔽 עדכון סטטוס זיכוי במסד
  if (growRefundResponse?.status === 1) {
    await userDocRef.update({
      wasRefunded: true,
      refundDate: new Date()
    });
  }

          } catch (e: unknown) {
            const err = e as any;
            // console.error('❌ שגיאה בביצוע החזר מול Grow:', err.message);
          }
        }
      } else {
        growMessage = typeof data?.err === 'string'
          ? data.err
          : data?.err?.message || 'Grow cancellation failed';
      }
    } else {
      growMessage = 'המנוי בוטל אצלנו, אך לא ב־Grow (חסר נתונים)';
    }

    // עדכון Firestore
    await userDocRef.update({
      subscriptionStatus: 'canceled',
      isActive: false,
      cancellationDate: new Date(),
      growCancellationStatus: growCanceled ? 'success' : 'failed',
      ...(updates || {})
    });

    // השבתת המשתמש הראשי
    try {
      await admin.auth().updateUser(id, { disabled: true });
      // console.log('🔒 המשתמש הושבת ב־Firebase Auth');
    } catch (authError: unknown) {
      const err = authError as any;
      // console.error('❌ שגיאה בהשבתת המשתמש:', err.message);
    }

    // השבתת עובדים של הסוכן
    try {
      const workersSnap = await db.collection('users')
        .where('agentId', '==', id)
        .where('role', '==', 'worker')
        .get();

      const disablePromises: Promise<any>[] = [];

      workersSnap.forEach(workerDoc => {
        const workerId = workerDoc.id;
        disablePromises.push(workerDoc.ref.update({ isActive: false }));
        disablePromises.push(
          admin.auth().updateUser(workerId, { disabled: true }).catch((e: any) => {
            // console.error(`❌ שגיאה בהשבתת עובד ${workerId}:`, e.message);
          })
        );
      });

      await Promise.all(disablePromises);
      // console.log(`🔒 הושבתו ${workersSnap.size} עובדים של הסוכן`);
    } catch (e: unknown) {
      const err = e as any;
      // console.error('❌ שגיאה באיתור או השבתת העובדים:', err.message);
    }

    // שליחת מייל ביטול אם רלוונטי
    if (sendCancelEmail && userEmail) {
      await sendCancelSubscriptionEmail({ email: userEmail, name: userName, refunded: shouldRefund });
    }

    return NextResponse.json({
      success: true,
      growCanceled,
      message: growMessage || 'המנוי בוטל בהצלחה'
    });
  } catch (err: unknown) {
    const error = err as any;
    // console.error('❌ CancelSubscription error:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
