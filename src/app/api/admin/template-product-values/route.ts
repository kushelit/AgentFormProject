// ═══════════════════════════════════════════════════════════════════
// app/api/admin/template-product-values/route.ts
// ערכי המוצר הגולמיים שנקלטו בפועל בתבנית (כל הסוכנים) — לטיוב productMap.
// מחזיר לכל ערך: כמות שורות + חודש הדיווח האחרון שבו הופיע.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { guardAdmin } from '@/lib/server/auth';

export const maxDuration = 60;

const MAX_VALUES = 2000;

export async function POST(req: NextRequest) {
const denied = await guardAdmin(req, 'admin/template-product-values');
if (denied) return denied;
  try {
    const { templateId } = await req.json();
    if (!templateId) return NextResponse.json({ error: 'missing templateId' }, { status: 400 });

    const snap = await admin
      .firestore()
      .collection('policyCommissionSummaries')
      .where('templateId', '==', String(templateId))
      .select('product', 'reportMonth')
      .get();

    const acc = new Map<string, { raw: string; count: number; lastReportMonth: string }>();
    snap.docs.forEach((d) => {
      const x: any = d.data();
      const raw = String(x.product ?? '').trim();
      const rm = String(x.reportMonth ?? '');
      const cur = acc.get(raw);
      if (cur) {
        cur.count += 1;
        if (rm > cur.lastReportMonth) cur.lastReportMonth = rm;
      } else {
        acc.set(raw, { raw, count: 1, lastReportMonth: rm });
      }
    });

    const values = Array.from(acc.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_VALUES);

    return NextResponse.json({ values, scanned: snap.size, truncated: acc.size > MAX_VALUES });
  } catch (err: any) {
    console.error('[template-product-values]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}
