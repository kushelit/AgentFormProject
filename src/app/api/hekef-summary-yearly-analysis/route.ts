// app/api/hekef-summary-yearly-analysis/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { agentId, year } = await req.json();
    if (!agentId || !year) return NextResponse.json({ error: 'missing params' }, { status: 400 });

    const db = admin.firestore();

    // שלוף templateIds עם hekefType
    const templatesSnap = await db.collection('commissionTemplates').where('isactive', '==', true).get();
    const hekefTemplateIds = new Set(
      templatesSnap.docs.filter(d => !!d.data().hekefType).map(d => d.id)
    );

    const snap = await db
      .collection('policyCommissionSummaries')
      .where('agentId', '==', agentId)
      .where('reportMonth', '>=', `${year}-01`)
      .where('reportMonth', '<=', `${year}-12`)
      .get();

    const rows = snap.docs
      .map(d => {
        const x: any = d.data();
        return {
          policyNumberKey: x.policyNumberKey,
          customerId: x.customerId,
          fullName: x.fullName,
          product: x.product,
          totalPremiumAmount: x.totalPremiumAmount ?? 0,
          companyName: x.company || '',
          templateId: x.templateId,
          validMonth: x.validMonth,
          reportMonth: x.reportMonth,
        };
      })
      .filter(r => hekefTemplateIds.has(r.templateId));

    return NextResponse.json({ rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}