import { NextResponse } from 'next/server';
import { guardAdmin } from '@/lib/server/auth';
import { sendAppEmail } from '@/lib/server/sendAppEmail';

// Admin-only HTTP route (admin screens). Server code calls sendAppEmail() directly.
export async function POST(req) {
  const denied = await guardAdmin(req, 'sendEmail');
  if (denied) return denied;
  try {
    const { to, subject, text, html, fromName } = await req.json();
    if (!to || !subject || (!text && !html)) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, and text or html' },
        { status: 400 }
      );
    }
    const result = await sendAppEmail({ to, subject, text, html, fromName });
    if (!result.success) return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    return NextResponse.json({ message: 'Email sent successfully!' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
