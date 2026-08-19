import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';
import { GROW_ENDPOINTS } from '@/lib/growApi';
import { GROW_USER_ID } from '@/lib/env';

export async function POST(req: NextRequest) {
  try {
    // 🔐 אימות המשתמש המחובר
    const authHeader = req.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    const uid = decodedToken.uid;

    const db = admin.firestore();
    const userDocRef = db.collection('users').doc(uid);
    const userSnap = await userDocRef.get();

    if (!userSnap.exists) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = userSnap.data();

    const transactionToken = userData?.transactionToken;
    const transactionId = userData?.transactionId;
    const asmachta = userData?.asmachta;

    if (!transactionToken || !transactionId || !asmachta) {
      return NextResponse.json(
        {
          error: 'חסרים נתוני הוראת הקבע. לא ניתן לעדכן כרגע את כרטיס האשראי.',
        },
        { status: 400 }
      );
    }

    const formData = new URLSearchParams();

    formData.append('userId', GROW_USER_ID);
    formData.append('transactionToken', String(transactionToken));
    formData.append('transactionId', String(transactionId));
    formData.append('asmachta', String(asmachta));

    // ✅ הפעולה היחידה שאנחנו מבקשים מ-GROW
    formData.append('updateCard', '1');

    const { data } = await axios.post(
      GROW_ENDPOINTS.updateDirectDebit,
      formData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (data?.status !== 1 || !data?.data) {
      return NextResponse.json(
        {
          error: 'Grow card update failed',
          details: data,
        },
        { status: 502 }
      );
    }

    const updateCardUrl = String(data.data);

    // מוודאים שקיבלנו URL ולא משהו בלתי צפוי
    if (!updateCardUrl.startsWith('https://')) {
      return NextResponse.json(
        {
          error: 'Grow returned an invalid update URL',
        },
        { status: 502 }
      );
    }

    // אנחנו יודעים שנוצר תהליך החלפה,
    // אבל עדיין לא יודעים שהלקוח השלים אותו.
    await userDocRef.update({
      paymentMethodUpdateRequestedAt:
        admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      updateCardUrl,
    });
  } catch (err: any) {
    console.error('[updatePaymentMethod]', {
      message: err?.message,
      axiosStatus: err?.response?.status,
      axiosData: err?.response?.data,
    });

    return NextResponse.json(
      {
        error: 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}