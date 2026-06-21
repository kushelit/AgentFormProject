// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary-by-template-agent/route.ts
// פירוט לפי מספר סוכן, מסונן לתבנית+חודש ספציפיים (ולא לכל החברה)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  const { agentId, companyId, templateId, month, ym } = await req.json();

  if (!agentId || !companyId || !templateId || !month) {
    return NextResponse.json({ error: 'missing params (agentId, companyId, templateId, month)' }, { status: 400 });
  }

  try {
    const db = admin.firestore();

    // אם יש ym — שלוף את ה-runIds המורשים (אותו דפוס כמו ב-commission-summary-by-template)
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
    }

    const snap = await db
      .collection('commissionSummaries')
      .where('agentId', '==', agentId)
      .where('companyId', '==', companyId)
      .where('templateId', '==', templateId)
      .where('reportMonth', '==', month)
      .get();

    const byAgent: Record<string, number> = {};

    for (const doc of snap.docs) {
      const r = doc.data() as any;
      if (allowedRunIds !== null && !allowedRunIds.has(String(r.runId || ''))) continue;

      const agentCode = String(r.agentCode || '-');
      byAgent[agentCode] = (byAgent[agentCode] || 0) + Number(r.totalCommissionAmount || 0);
    }

    return NextResponse.json({ byAgent });

  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}