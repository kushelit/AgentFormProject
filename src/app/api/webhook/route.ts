import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const formData = await req.formData();
  console.log('📥 Received webhook:', Object.fromEntries(formData));
  return NextResponse.json({ ok: true });
}
