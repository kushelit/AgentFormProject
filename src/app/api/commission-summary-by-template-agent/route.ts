// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary-by-template-agent/route.ts
// אותו תיקון כמו ב-commission-summary-by-template: כש-ym מועבר, קוראים
// מ-externalCommissions (ledger גולמי) במקום מ-commissionSummaries הממוזג.
// בלי ym (חודש דיווח) — ללא שינוי.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { getDocsByFieldInBatches } from '@/lib/server/firestoreBatch';

export async function POST(req: NextRequest) {
  const { agentId, companyId, templateId, month, ym } = await req.json();

  if (!agentId || !companyId || !templateId || !month) {
    return NextResponse.json(
      { error: 'missing params (agentId, companyId, templateId, month)' },
      { status: 400 }
    );
  }

  try {
    const db = admin.firestore();
    const byAgent: Record<string, number> = {};

    if (ym) {
      // ─── מצב "לפי חודש פרסום": externalCommissions ────────────────────
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

      if (!jobIds.length) {
        return NextResponse.json({ byAgent: {} });
      }

      const externalDocs = await getDocsByFieldInBatches({
        collection: 'externalCommissions',
        field: 'runId',
        values: jobIds,
        extraWhere: [
          ['agentId', '==', agentId],
          ['companyId', '==', companyId],
          ['templateId', '==', templateId],
          ['reportMonth', '==', month],
        ],
      });

      for (const doc of externalDocs) {
        const r = doc.data() as any;
        const agentCode = String(r.agentCode || '-').trim(); // 🔧 נירמול הגנתי, כמו ב-commissionSummaries
        const amount = Number(r.commissionAmount || 0);
        byAgent[agentCode] = (byAgent[agentCode] || 0) + amount;
      }
    } else {
      // ─── מצב "לפי חודש דיווח": commissionSummaries הממוזג, ללא שינוי ───
      const snap = await db
        .collection('commissionSummaries')
        .where('agentId', '==', agentId)
        .where('companyId', '==', companyId)
        .where('templateId', '==', templateId)
        .where('reportMonth', '==', month)
        .get();

      for (const doc of snap.docs) {
        const r = doc.data() as any;
        const agentCode = String(r.agentCode || '-');
        byAgent[agentCode] = (byAgent[agentCode] || 0) + Number(r.totalCommissionAmount || 0);
      }
    }

    return NextResponse.json({ byAgent });
  } catch (err: any) {
    console.error('[commission-summary-by-template-agent]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}