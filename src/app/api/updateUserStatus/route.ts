// /app/api/updateUserStatus/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { uid, disabled } = await req.json();

    if (!uid || typeof disabled !== 'boolean') {
      return NextResponse.json({ error: 'Missing uid or disabled status' }, { status: 400 });
    }

    await admin.auth().updateUser(uid, { disabled });

    return NextResponse.json({ success: true });
  } catch (err) {
    // console.error('שגיאה בעדכון Firebase Auth:', err);
    return NextResponse.json({ error: 'שגיאה בעדכון משתמש' }, { status: 500 });
  }
}
