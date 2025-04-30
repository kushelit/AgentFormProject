import { NextResponse } from 'next/server';

export async function POST() {
  console.log('🧪 Webhook test received.');
  return NextResponse.json({ ok: true });
}
