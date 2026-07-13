// ═══════════════════════════════════════════════════════════════════
// app/api/anomaly-policies/route.ts
// תיקון: סינון תבניות "היקף" (hekefType) — נכלל רק תבניות נפרעים
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  const { agentId, reportMonth } = await req.json();

  if (!agentId || !reportMonth) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  try {
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

    const snap = await db
      .collection('policyCommissionSummaries')
      .where('agentId', '==', agentId)
      .where('reportMonth', '==', reportMonth)
      .get();

    const allRows = snap.docs
      .map((d) => {
        const x: any = d.data();
        return {
          policyNumberKey: x.policyNumberKey,
          customerId: x.customerId,
          fullName: x.fullName,
          product: x.product,
          templateId: x.templateId,
          companyId: x.companyId,
          company: x.company,
          agentCode: x.agentCode,
          reportMonth: x.reportMonth,
          totalCommissionAmount: Number(x.totalCommissionAmount ?? 0),
          totalPremiumAmount: Number(x.totalPremiumAmount ?? 0),
          commissionRate: Number(x.commissionRate ?? 0),
          validMonth: x.validMonth,
        };
      })
      // ─── סינון: רק templates שאין להם hekefType (= "נפרעים") ─────────────
      .filter((r) => !hekefTemplateIds.has(String(r.templateId || '')));

    const anomalies = allRows.filter(r => r.totalCommissionAmount <= 0);

    anomalies.sort((a, b) => {
      const aWorst = a.totalPremiumAmount > 0 && a.totalCommissionAmount <= 0;
      const bWorst = b.totalPremiumAmount > 0 && b.totalCommissionAmount <= 0;
      if (aWorst && !bWorst) return -1;
      if (!aWorst && bWorst) return 1;
      return b.totalPremiumAmount - a.totalPremiumAmount;
    });

    // console.log('[anomaly] total rows (after hekef filter):', allRows.length);
    // console.log('[anomaly] negative rows:', allRows.filter(r => r.totalCommissionAmount < 0).length);
    // console.log('[anomaly] anomalies:', anomalies.length);

    return NextResponse.json({ rows: anomalies, total: anomalies.length });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'server error' },
      { status: 500 }
    );
  }
}