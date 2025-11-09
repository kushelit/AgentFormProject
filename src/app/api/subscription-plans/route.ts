// app/api/subscription-plans/route.ts
import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

// 👇 מונע לחלוטין קאשינג בפרוד
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const db = admin.firestore();

    const snapshot = await db
      .collection('subscriptions_permissions')
      .where('isActive', '==', true)
      .get();

    const plans = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || doc.id,
        price: data.price || 0,
        description: `כולל ${data.permissions?.length || 0} הרשאות, עד ${data.maxUsers || 1} משתמשים`,
        permissions: data.permissions || [],
        maxUsers: data.maxUsers || 1,
      };
    });

    // ✅ החזרת תשובה עם כותרות שמונעות קאשינג לחלוטין
    return NextResponse.json(plans, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Surrogate-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('🔥 Failed to load plans:', error);
    return NextResponse.json(
      { error: 'Failed to load plans' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
