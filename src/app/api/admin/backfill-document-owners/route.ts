// app/api/admin/backfill-document-owners/route.ts
// System admin only (always enforced): add AgentId to existing customer/lead documents.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { backfillDocumentOwners } from '@/lib/server/documentOwners';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (!user.isSystem) return NextResponse.json({ error: 'רק מנהלת מערכת' }, { status: 403 });
  try {
    return NextResponse.json(await backfillDocumentOwners());
  } catch (e) {
    console.error('[admin/backfill-document-owners]', e);
    return NextResponse.json({ error: 'ההשלמה נכשלה' }, { status: 500 });
  }
}
