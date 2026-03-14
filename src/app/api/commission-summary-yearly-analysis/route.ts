import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { agentId, year } = await req.json();

    if (!agentId || !year) {
      return NextResponse.json({ error: 'missing params' }, { status: 400 });
    }

    const db = admin.firestore();

    // שאילתה שמביאה את כל הפוליסות של הסוכן לאותה שנה
    // אנחנו מורידים את ההגבלה של חברה וקוד סוכן כדי לקבל מבט שנתי מלא
    const snap = await db
      .collection('policyCommissionSummaries')
      .where('agentId', '==', agentId)
      .where('reportMonth', '>=', `${year}-01`)
      .where('reportMonth', '<=', `${year}-12`)
      .get();

  // בתוך ה-snap.docs.map ב-Route שלך:
const rows = snap.docs.map((d) => {
  const x: any = d.data();
  return {
    policyNumberKey: x.policyNumberKey,
    customerId: x.customerId,
    fullName: x.fullName,
    product: x.product,
    totalCommissionAmount: x.totalCommissionAmount ?? 0,
    // התיקון כאן: אנחנו לוקחים את x.company מה-Firestore ושולחים כ-companyName
    companyName: x.company || 'כלל', 
    templateId: x.templateId,
    productGroup: x.productGroup || x.productsGroup || '',
    validMonth: x.reportMonth,
  };
});
    return NextResponse.json({ rows });

  } catch (err: any) {
    console.error('[commission-summary-yearly-analysis]', err);
    return NextResponse.json(
      { error: err.message ?? 'server error' },
      { status: 500 }
    );
  }
}