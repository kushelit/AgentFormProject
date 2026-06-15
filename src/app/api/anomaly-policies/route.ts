import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  const { agentId, reportMonth } = await req.json();

  if (!agentId || !reportMonth) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  try {
    const db = admin.firestore();

    const snap = await db
      .collection('policyCommissionSummaries')
      .where('agentId', '==', agentId)
      .where('reportMonth', '==', reportMonth)
      .get();

   const allRows = snap.docs.map((d) => {
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
    totalCommissionAmount: Number(x.totalCommissionAmount ?? 0),  // ← שינוי
    totalPremiumAmount: Number(x.totalPremiumAmount ?? 0),        // ← שינוי
    commissionRate: Number(x.commissionRate ?? 0),                // ← שינוי
    validMonth: x.validMonth,
  };
});

    const anomalies = allRows.filter(r => r.totalCommissionAmount <= 0);

    anomalies.sort((a, b) => {
      const aWorst = a.totalPremiumAmount > 0 && a.totalCommissionAmount <= 0;
      const bWorst = b.totalPremiumAmount > 0 && b.totalCommissionAmount <= 0;
      if (aWorst && !bWorst) return -1;
      if (!aWorst && bWorst) return 1;
      return b.totalPremiumAmount - a.totalPremiumAmount;
    });

    console.log('[anomaly] total rows:', allRows.length);
console.log('[anomaly] negative rows:', allRows.filter(r => r.totalCommissionAmount < 0).length);
console.log('[anomaly] anomalies:', anomalies.length);

    return NextResponse.json({ rows: anomalies, total: anomalies.length });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'server error' },
      { status: 500 }
    );
  }
}