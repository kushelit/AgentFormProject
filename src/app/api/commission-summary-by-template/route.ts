import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  const { agentId, companyId, year, ym } = await req.json();

  if (!agentId || !companyId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  try {
    const db = admin.firestore();

    // אם יש ym — שלוף את ה-runIds הרלוונטיים
    let allowedRunIds: Set<string> | null = null;

    if (ym) {
      const portalRunsSnap = await db
        .collection('portalImportRuns')
        .where('agentId', '==', agentId)
        .where('companyId', '==', companyId)
        .where('resolvedWindow.ym', '==', ym)
        .get();

      const jobIds: string[] = [];
      for (const d of portalRunsSnap.docs) {
        const ids: string[] = d.data()?.queue?.jobIds || [];
        jobIds.push(...ids);
      }
      allowedRunIds = new Set(jobIds);

       console.log('[template-drill] ym received:', ym);
  console.log('[template-drill] portalRuns found:', portalRunsSnap.size);
  console.log('[template-drill] allowedRunIds:', Array.from(allowedRunIds));
    }

    
    const snap = await db
      .collection('commissionSummaries')
      .where('agentId', '==', agentId)
      .where('companyId', '==', companyId)
      .get();

    const rows = snap.docs.map(d => d.data() as any);

    const filtered = rows.filter(r => {
      if (year && !String(r.reportMonth || '').startsWith(year)) return false;
      if (allowedRunIds !== null && !allowedRunIds.has(String(r.runId || ''))) return false;
      return true;

      
    });

    console.log('[template-drill] filtered rows:', filtered.length, '/', rows.length);
    // ... שאר הקוד קיים ללא שינוי ...
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