// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary-yearly-analysis/route.ts
// תיקון: סינון תבניות "היקף" (hekefType) — נכלל רק תבניות נפרעים
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

    // ─── שלוף templateIds שהם "היקף" — אלה שיש להם hekefType ──────────────
    const templatesSnap = await db
      .collection('commissionTemplates')
      .where('isactive', '==', true)
      .get();

    const hekefTemplateIds = new Set(
      templatesSnap.docs
        .filter(d => !!d.data().hekefType)
        .map(d => d.id)
    );

    // שאילתה שמביאה את כל הפוליסות של הסוכן לאותה שנה
    const snap = await db
      .collection('policyCommissionSummaries')
      .where('agentId', '==', agentId)
      .where('reportMonth', '>=', `${year}-01`)
      .where('reportMonth', '<=', `${year}-12`)
      .get();

    const rows = snap.docs
      .map((d) => {
        const x: any = d.data();
        return {
          policyNumberKey: x.policyNumberKey,
          customerId: x.customerId,
          fullName: x.fullName,
          product: x.product,
          totalCommissionAmount: x.totalCommissionAmount ?? 0,
          companyName: x.company || 'כלל',
          templateId: x.templateId,
          productGroup: x.productGroup || x.productsGroup || '',
          validMonth: x.validMonth,
          reportMonth: x.reportMonth,
        };
      })
      // ─── סינון: רק templates שאין להם hekefType (= "נפרעים") ─────────────
      .filter((r) => !hekefTemplateIds.has(r.templateId));

    return NextResponse.json({ rows });

  } catch (err: any) {
     console.error('[commission-summary-yearly-analysis]', err);
    return NextResponse.json(
      { error: err.message ?? 'server error' },
      { status: 500 }
    );
  }
}