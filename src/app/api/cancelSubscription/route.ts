// File: /app/api/cancelSubscription/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const { id, subscriptionId, transactionToken, transactionId, asmachta, updates, sendCancelEmail } = await req.json();
    const db = admin.firestore();

    let userDocRef = null;
    // let userEmail = '';
    // let userName = '';

    // // שליפת פרטי המשתמש
    // if (id) {
    //   userDocRef = db.collection('users').doc(id);
    //   const userSnap = await userDocRef.get();
    //   const userData = userSnap.data();
    //   if (userData) {
    //     userEmail = userData.email;
    //     userName = userData.name;
    //   }
    // } else if (subscriptionId) {
    //   const snapshot = await db.collection('users').where('subscriptionId', '==', subscriptionId).get();
    //   if (!snapshot.empty) {
    //     userDocRef = snapshot.docs[0].ref;
    //     const userData = snapshot.docs[0].data();
    //     userEmail = userData.email;
    //     userName = userData.name;
    //   } else {
    //     return NextResponse.json({ error: 'User not found for subscriptionId' }, { status: 404 });
    //   }
    // }

    // if (!userDocRef) {
    //   return NextResponse.json({ error: 'Missing user ID or subscriptionId' }, { status: 400 });
    // }
    // שליפת פרטי המשתמש
let userData = null;

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

// --- שליפת שדות נלווים ---
const userEmail = userData.email;
const userName = userData.name;
const subscriptionStartDate = userData?.subscriptionStartDate?.toDate?.() || null;
const totalCharged = userData?.totalCharged || null;


    // ניסיון ביטול ב־Grow אם יש transactionId
    let growCanceled = false;
    let growMessage = '';

    
    console.log('Sending to Grow:', {
      transactionToken : transactionToken ,
      userId: '8f215caa9b2a3903',
      action: 'cancel',
    });
    

    if (transactionToken && transactionId && asmachta) {
      const formData = new URLSearchParams();
      formData.append('userId', '8f215caa9b2a3903');
      formData.append('transactionToken', transactionToken);
      formData.append('transactionId', transactionId);
      formData.append('asmachta', asmachta);
      // formData.append('action', 'cancel');
      formData.append('changeStatus', '2');


// שלב הדפסה מלאה של formData
console.log('🔍 Params sent to Grow:');
formData.forEach((value, key) => {
  console.log(`${key} = ${value}`);
});

let shouldRefund = false;

if (subscriptionStartDate && totalCharged) {
  const daysSinceStart = (Date.now() - subscriptionStartDate.getTime()) / (1000 * 60 * 60 * 24);
  shouldRefund = daysSinceStart > 1 && daysSinceStart <= 14;
}

      const { data } = await axios.post(
        'https://sandbox.meshulam.co.il/api/light/server/1.0/updateDirectDebit',
        formData,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      console.log('🔁 Grow cancel result:', data);

      if (data?.status === '1') {
        growCanceled = true;

 // ✅ שלב ההחזר - רק אם בתוך 14 יום מההרשמה
 if (shouldRefund && transactionToken && transactionId) {
  const refundForm = new URLSearchParams();
  refundForm.append('userId', '8f215caa9b2a3903');
  refundForm.append('transactionToken', transactionToken);
  refundForm.append('transactionId', transactionId);
  refundForm.append('refundSum', totalCharged.toString()); // באגורות
  refundForm.append('stopDirectDebit', '1');

  try {
    const refundRes = await axios.post(
      'https://sandbox.meshulam.co.il/api/light/server/1.0/refundTransaction',
      refundForm,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    console.log('🔁 Grow refund result:', refundRes.data);
  } catch (e: any) {
    console.error('❌ שגיאה בביצוע החזר מול Grow:', e.message);
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
    
    try {
      await admin.auth().updateUser(id, { disabled: true });
      console.log('🔒 המשתמש הושבת ב־Firebase Auth');
    } catch (authError) {
      console.error('❌ שגיאה בהשבתת המשתמש:', authError);
    }
    
    // 🔁 השבתת כל העובדים של הסוכן
try {
  const workersSnap = await db.collection('users')
    .where('agentId', '==', id)
    .where('role', '==', 'worker')
    .get();

  const disablePromises: Promise<any>[] = [];

  workersSnap.forEach(workerDoc => {
    const workerId = workerDoc.id;

    // עדכון Firestore
    disablePromises.push(
      workerDoc.ref.update({ isActive: false })
    );

    // עדכון Firebase Auth
    disablePromises.push(
      admin.auth().updateUser(workerId, { disabled: true }).catch((e) => {
        console.error(`❌ שגיאה בהשבתת עובד ${workerId}:`, e.message);
      })
    );
  });

  await Promise.all(disablePromises);
  console.log(`🔒 הושבתו ${workersSnap.size} עובדים של הסוכן`);

} catch (e: any) {
  console.error('❌ שגיאה באיתור או השבתת העובדים:', e.message);
}


    // שליחת מייל ביטול אם רלוונטי
    if (sendCancelEmail && userEmail) {
      await fetch('https://test.magicsale.co.il/api/sendCancelEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, name: userName })
      });
    }

    return NextResponse.json({
      success: true,
      growCanceled,
      message: growMessage || 'המנוי בוטל בהצלחה'
    });
  } catch (err: any) {
    console.error('❌ CancelSubscription error:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
