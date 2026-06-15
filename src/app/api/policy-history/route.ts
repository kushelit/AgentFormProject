import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  const { agentId, companyId, policyNumberKey } = await req.json();

  if (!agentId || !companyId || !policyNumberKey) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  try {
    const db = admin.firestore();

   const snap = await db
  .collection('policyCommissionSummaries')
  .where('agentId', '==', agentId)
  .where('companyId', '==', companyId)
  .where('policyNumberKey', '==', policyNumberKey)
  .limit(60)
  .get();

const rows = snap.docs.map((d) => {
  const x: any = d.data();
  return {
    reportMonth: x.reportMonth,
    agentCode: x.agentCode,
    totalCommissionAmount: x.totalCommissionAmount ?? 0,
    totalPremiumAmount: x.totalPremiumAmount ?? 0,
    commissionRate: x.commissionRate ?? 0,
    product: x.product,
    customerId: x.customerId,
    fullName: x.fullName,
    templateId: x.templateId,
    validMonth: x.validMonth,
  };
});

// מיון ב-JS במקום Firestore
rows.sort((a, b) => b.reportMonth.localeCompare(a.reportMonth));
    return NextResponse.json({ rows });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'server error' },
      { status: 500 }
    );
  }
}