import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { couponCode, plan } = await req.json();

    if (!couponCode) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const db = admin.firestore();
    const ref = db.collection('coupons').doc(couponCode.trim());
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ valid: false, reason: 'לא נמצא' });
    }

    const data = snap.data()!; // ← זה הפתרון להערת TypeScript

    // בדיקת תקינות והאם פעיל
    if (!data.isActive || (data.planId && data.planId !== plan)) {
      return NextResponse.json({ valid: false, reason: 'לא פעיל או לא מתאים למסלול' });
    }

    return NextResponse.json({
      valid: true,
      discount: data.discount || 0,
    });
  } catch (err) {
    console.error('❌ validate-coupon error:', err);
    return NextResponse.json({ valid: false, error: 'שגיאה בשרת' }, { status: 500 });
  }
}
