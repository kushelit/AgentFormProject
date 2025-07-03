import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function GET() {
  try {
    const db = admin.firestore();
const snapshot = await db
  .collection('subscriptions_permissions')
  .where('isActive', '==', true)
  .get();

  const plans = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || doc.id,
      price: data.price || 0,
      description: `כולל ${data.permissions?.length || 0} הרשאות, עד ${data.maxUsers || 1} משתמשים`,
      permissions: data.permissions || [], // ✅ הוספה חשובה
      maxUsers: data.maxUsers || 1,       // ✅ כדי שבריאקט לא תצטרכי להסתמך על default
    };
  });
  

    return NextResponse.json(plans);
  } catch (error) {
    console.error('🔥 Failed to load plans:', error);
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 });
  }
}
