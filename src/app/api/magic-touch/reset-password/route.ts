import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import {
  buildMagicTouchPasswordResetEmail,
  generateMagicTouchPasswordResetLink,
  sendMagicTouchEmail,
} from '@/lib/MagicTouch/magicTouchAccountEmails';

export const dynamic = 'force-dynamic';

/*
 * איפוס סיסמה ממותג MagicTouch.
 *
 * תמיד מחזיר ok, גם כשהמייל לא קיים,
 * כדי לא לחשוף אילו כתובות רשומות במערכת.
 */
export async function POST(req: NextRequest) {
  let email = '';

  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'כתובת המייל אינה תקינה.' }, { status: 400 });
  }

  try {
    const resetLink = await generateMagicTouchPasswordResetLink(
      admin.auth(),
      email
    );

    await sendMagicTouchEmail({
      to: email,
      ...buildMagicTouchPasswordResetEmail({ resetLink }),
    });
  } catch (error: any) {
    if (error?.code !== 'auth/user-not-found') {
      console.error(
        '[MagicTouch][reset-password] failed',
        error?.code || error?.message || error
      );

      return NextResponse.json(
        { error: 'שליחת המייל נכשלה. יש לנסות שוב.' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
