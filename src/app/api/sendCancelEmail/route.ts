// File: /app/api/sendCancelEmail/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/server/auth';
import { sendCancelSubscriptionEmail } from '@/lib/server/sendAppEmail';

export async function POST(req: NextRequest) {
  const denied = await guardAdmin(req, 'sendCancelEmail');
  if (denied) return denied;
  try {
    const { email, name, refunded } = await req.json();

    if (!email || !name) {
      return NextResponse.json({ error: 'Missing email or name' }, { status: 400 });
    }

    const result = await sendCancelSubscriptionEmail({ email, name, refunded });
    if (!result.success) return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
