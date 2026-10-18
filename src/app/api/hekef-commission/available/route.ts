// app/api/hekef-commission/available/route.ts
// האם להציג את טאב "היקף": רק כשקיימת תבנית hekefType = hekef_commission.
// בסביבה בלי תבנית כזו (למשל ייצור לפני העלייה) הטאב לא מופיע.

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { guardUser } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = await guardUser(req, 'hekef-commission-available');
  if (denied) return denied;
  try {
    const snap = await admin
      .firestore()
      .collection('commissionTemplates')
      .where('hekefType', '==', 'hekef_commission')
      .limit(1)
      .get();
    return NextResponse.json({ enabled: !snap.empty });
  } catch (err) {
    console.error('[hekef-commission/available]', err);
    return NextResponse.json({ enabled: false });
  }
}
