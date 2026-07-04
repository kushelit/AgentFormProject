// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary-by-ym/route.ts
// גרסה מהירה: קורא מ-ymCommissionSummaries (מסמכים מסכמים)
// ולא מ-externalCommissions (ledger גולמי).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { agentId, year } = await req.json();

    if (!agentId || !year) {
      return NextResponse.json({ error: 'missing params' }, { status: 400 });
    }

    const db = admin.firestore();

    const templatesSnap = await db
      .collection('commissionTemplates')
      .where('isactive', '==', true)
      .get();

    const hekefTemplateIds = new Set(
      templatesSnap.docs.filter(d => !!d.data().hekefType).map(d => d.id)
    );

    const ymSnap = await db
      .collection('ymCommissionSummaries')
      .where('agentId', '==', agentId)
      .where('ym', '>=', `${year}-01`)
      .where('ym', '<=', `${year}-12`)
      .get();

    const summaryByYmCompany: Record<string, Record<string, number>> = {};

    for (const d of ymSnap.docs) {
      const r = d.data() as any;
      if (hekefTemplateIds.has(String(r.templateId || ''))) continue;

      const ym = String(r.ym || '');
      const companyName = String(r.company || 'לא ידוע');
      const amount = Number(r.totalCommissionAmount || 0);

      if (!ym) continue;

      if (!summaryByYmCompany[ym]) summaryByYmCompany[ym] = {};
      summaryByYmCompany[ym][companyName] = (summaryByYmCompany[ym][companyName] || 0) + amount;
    }

    return NextResponse.json({ summaryByYmCompany });

  } catch (err: any) {
    console.error('[commission-summary-by-ym]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}