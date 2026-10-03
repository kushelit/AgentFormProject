// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary-by-template-agent/route.ts
// פירוט תבנית + חודש דיווח לפי מספר סוכן.
//
// ym (חודש פרסום):
//   מקור ראשי — ymCommissionSummaries (כבר מסוכם לפי מספר סוכן).
//   גיבוי — אם לא נמצא כלום: externalCommissions לפי runId-ים (כמו קודם).
// בלי ym (חודש דיווח): commissionSummaries הממוזג — כמו קודם, עם שדות נבחרים.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { jobIdsForYm, queryByRunIds } from '@/lib/server/drillHelpers';
import { guardAgentAccess } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  const { agentId, companyId, templateId, month, ym } = await req.json();
  const denied = await guardAgentAccess(req, agentId, 'commission-summary-by-template-agent');
  if (denied) return denied;

  if (!agentId || !companyId || !templateId || !month) {
    return NextResponse.json({ error: 'missing params (agentId, companyId, templateId, month)' }, { status: 400 });
  }

  try {
    const db = admin.firestore();
    const byAgent: Record<string, number> = {};
    const add = (code: any, amount: any) => {
      const agentCode = String(code || '-').trim();
      byAgent[agentCode] = (byAgent[agentCode] || 0) + Number(amount || 0);
    };

    if (ym) {
      // ─── ymCommissionSummaries ─────────────────────────────────────────
      const snap = await db
        .collection('ymCommissionSummaries')
        .where('agentId', '==', agentId)
        .where('ym', '==', ym)
        .where('companyId', '==', companyId)
        .where('templateId', '==', templateId)
        .where('reportMonth', '==', month)
        .select('agentCode', 'totalCommissionAmount')
        .get();

      snap.docs.forEach((d) => {
        const r: any = d.data();
        add(r.agentCode, r.totalCommissionAmount);
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
              ['templateId', '==', templateId],
              ['reportMonth', '==', month],
            ],
            fields: ['agentCode', 'commissionAmount'],
          });
          rows.forEach((r) => add(r.agentCode, r.commissionAmount));
        }
      }
    } else {
      // ─── חודש דיווח: commissionSummaries ──────────────────────────────
      const snap = await db
        .collection('commissionSummaries')
        .where('agentId', '==', agentId)
        .where('companyId', '==', companyId)
        .where('templateId', '==', templateId)
        .where('reportMonth', '==', month)
        .select('agentCode', 'totalCommissionAmount')
        .get();

      snap.docs.forEach((d) => {
        const r: any = d.data();
        add(r.agentCode, r.totalCommissionAmount);
      });
    }

    return NextResponse.json({ byAgent });
  } catch (err: any) {
    console.error('[commission-summary-by-template-agent]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}