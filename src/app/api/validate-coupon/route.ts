import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { couponCode, plan } = await req.json();

    if (!couponCode?.trim()) {
      return NextResponse.json(
        { valid: false, reason: 'לא הוזן קוד קופון' },
        { status: 200 }
      );
    }
    
    if (!plan) {
      return NextResponse.json(
        { valid: false, reason: 'לא הוזן מסלול' },
        { status: 400 }
      );
    }
    

    const db = admin.firestore();
    const ref = db.collection('coupons').doc(couponCode.trim());
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ valid: false, reason: 'לא נמצא' });
    }

    const data = snap.data()!;

    // בדיקה אם פעיל
    if (!data.isActive) {
      return NextResponse.json({ valid: false, reason: 'הקופון אינו פעיל' });
    }

    // שליפת ההנחה הספציפית למסלול הנבחר
    const discount = data.planDiscounts?.[plan];

    if (typeof discount !== 'number' || discount <= 0) {
      return NextResponse.json({ valid: false, reason: 'הקופון לא תקף למסלול שנבחר' });
    }

    return NextResponse.json({
      valid: true,
      discount,
    });

  } catch (err) {
    console.error('❌ validate-coupon error:', err);
    return NextResponse.json({ valid: false, error: 'שגיאה בשרת' }, { status: 500 });
  }
}
