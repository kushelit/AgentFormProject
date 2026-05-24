import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  const { agentId, companyId, year } = await req.json();

  if (!agentId || !companyId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  try {
    const db = admin.firestore();

    const snap = await db
      .collection('commissionSummaries')
      .where('agentId', '==', agentId)
      .where('companyId', '==', companyId)
      .get();

    const rows = snap.docs.map(d => d.data() as any);

    // פילטר לפי שנה אם יש
    const filtered = year
      ? rows.filter(r => String(r.reportMonth || '').startsWith(year))
      : rows;

    // סיכום לפי templateId × reportMonth
    const byTemplateMonth: Record<string, Record<string, number>> = {};
    const templateNames: Record<string, string> = {};
    const allMonths = new Set<string>();

    for (const r of filtered) {
      const tid = String(r.templateId || '');
      const month = String(r.reportMonth || '');
      const amount = Number(r.totalCommissionAmount || 0);

      if (!tid || !month) continue;

      allMonths.add(month);
      if (!byTemplateMonth[tid]) byTemplateMonth[tid] = {};
      byTemplateMonth[tid][month] = (byTemplateMonth[tid][month] || 0) + amount;
    }

    // שלוף שמות תבניות
    const templateIds = Object.keys(byTemplateMonth);
    await Promise.all(templateIds.map(async (tid) => {
      const tSnap = await db.collection('commissionTemplates').doc(tid).get();
      if (tSnap.exists) {
        const data = tSnap.data() as any;
        templateNames[tid] = String(data.Name || data.type || tid);
      } else {
        templateNames[tid] = tid;
      }
    }));

    return NextResponse.json({
      byTemplateMonth,
      templateNames,
      allMonths: Array.from(allMonths).sort(),
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}