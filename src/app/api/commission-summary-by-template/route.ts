// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary-by-template/route.ts
// פילוח חברה לפי תבניות × חודשי דיווח.
//
// ym (חודש פרסום):
//   מקור ראשי — ymCommissionSummaries (מסוכם לפי ym+תבנית+חברה+חודש דיווח).
//   זה המקור של טבלת "לפי חודש פרסום", כך שהדריל תמיד תואם את הטבלה,
//   ונקראים עשרות מסמכים במקום אלפי שורות גולמיות.
//   גיבוי — אם לא נמצא כלום: externalCommissions לפי runId-ים (כמו קודם).
//
// בלי ym (חודש דיווח): commissionSummaries הממוזג — כמו קודם, רק עם שדות נבחרים.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { jobIdsForYm, loadTemplateInfo, queryByRunIds } from '@/lib/server/drillHelpers';

export async function POST(req: NextRequest) {
  const { agentId, companyId, year, ym } = await req.json();

  if (!agentId || !companyId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  try {
    const db = admin.firestore();
    const { names, hekef } = await loadTemplateInfo(db);

    const byTemplateMonth: Record<string, Record<string, number>> = {};
    const allMonths = new Set<string>();

    const add = (tid: string, month: string, amount: number) => {
      if (!tid || !month) return;
      if (hekef.has(tid)) return;
      if (year && !month.startsWith(String(year))) return;
      allMonths.add(month);
      if (!byTemplateMonth[tid]) byTemplateMonth[tid] = {};
      byTemplateMonth[tid][month] = (byTemplateMonth[tid][month] || 0) + amount;
    };

    if (ym) {
      // ─── ymCommissionSummaries ─────────────────────────────────────────
      const snap = await db
        .collection('ymCommissionSummaries')
        .where('agentId', '==', agentId)
        .where('ym', '==', ym)
        .where('companyId', '==', companyId)
        .select('templateId', 'reportMonth', 'totalCommissionAmount')
        .get();

      snap.docs.forEach((d) => {
        const r: any = d.data();
        add(String(r.templateId || ''), String(r.reportMonth || ''), Number(r.totalCommissionAmount || 0));
      });

      // ─── גיבוי: externalCommissions ────────────────────────────────────
      if (snap.empty) {
        const jobIds = await jobIdsForYm(db, agentId, companyId, ym);
        if (jobIds.length) {
          const rows = await queryByRunIds({
            db,
            collection: 'externalCommissions',
            runIds: jobIds,
            where: [
              ['agentId', '==', agentId],
              ['companyId', '==', companyId],
            ],
            fields: ['templateId', 'reportMonth', 'commissionAmount'],
          });
          rows.forEach((r) => add(String(r.templateId || ''), String(r.reportMonth || ''), Number(r.commissionAmount || 0)));
        }
      }
    } else {
      // ─── חודש דיווח: commissionSummaries ──────────────────────────────
      const snap = await db
        .collection('commissionSummaries')
        .where('agentId', '==', agentId)
        .where('companyId', '==', companyId)
        .select('templateId', 'reportMonth', 'totalCommissionAmount')
        .get();

      snap.docs.forEach((d) => {
        const r: any = d.data();
        add(String(r.templateId || ''), String(r.reportMonth || ''), Number(r.totalCommissionAmount || 0));
      });
    }

    const templateNames: Record<string, string> = {};
    Object.keys(byTemplateMonth).forEach((tid) => (templateNames[tid] = names[tid] || tid));

    return NextResponse.json({
      byTemplateMonth,
      templateNames,
      allMonths: Array.from(allMonths).sort(),
    });
  } catch (err: any) {
    console.error('[commission-summary-by-template]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}