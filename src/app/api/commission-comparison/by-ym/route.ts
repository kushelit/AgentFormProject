// ═══════════════════════════════════════════════════════════════════
// app/api/commission-comparison/by-ym/route.ts
// נתונים לדף "השוואת טעינות" לפי חודש פרסום (ym).
//
// action: 'listYms'  → חודשי הפרסום שיש לסוכן טעינות שהצליחו בהם (מהחדש לישן)
// action: 'policies' → מסמכי policyCommissionSummaries של חודש פרסום אחד,
//                      לפי רמת ההשוואה (תבנית / חברה / הכל)
//
// שרשרת חודש פרסום — אותה של הסקירה:
//   portalImportRuns.resolvedWindow.ym → queue.jobIds → commissionImportRuns → runId
// נפרעים בלבד — ללא תבניות hekefType.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { chunk, loadJobMeta, loadJobYms, loadTemplates, str } from '@/lib/insights/serverData';

export const maxDuration = 60;

const IN_LIMIT = 30;

const POLICY_FIELDS = [
  'agentId', 'agentCode', 'reportMonth', 'templateId', 'companyId', 'company', 'policyNumberKey',
  'customerId', 'product', 'totalCommissionAmount', 'totalPremiumAmount', 'commissionRate', 'rowsCount',
  'fullName', 'runId',
];

export async function POST(req: NextRequest) {
  try {
    const { agentId, action, ym, scope, companyId, templateId } = await req.json();
    if (!agentId || !action) return NextResponse.json({ error: 'missing params' }, { status: 400 });

    const db = admin.firestore();
    const { hekefTemplateIds } = await loadTemplates(db);

    // ─── חודשי פרסום זמינים ─────────────────────────────────────────────
    if (action === 'listYms') {
      const ymByJobId = await loadJobYms(db, agentId);
      const meta = await loadJobMeta(db, Object.keys(ymByJobId), hekefTemplateIds);
      const yms = Array.from(new Set(Object.keys(meta).map((id) => ymByJobId[id]))).sort().reverse();
      return NextResponse.json({ yms });
    }

    // ─── פוליסות של חודש פרסום ──────────────────────────────────────────
    if (action === 'policies') {
      if (!/^\d{4}-\d{2}$/.test(String(ym ?? ''))) {
        return NextResponse.json({ error: 'bad ym' }, { status: 400 });
      }

      const ymByJobId = await loadJobYms(db, agentId, String(ym).slice(0, 4));
      const jobIdsOfYm = Object.keys(ymByJobId).filter((id) => ymByJobId[id] === ym);
      const meta = await loadJobMeta(db, jobIdsOfYm, hekefTemplateIds);

      const jobIds = Object.entries(meta)
        .filter(([, m]) => {
          if (scope === 'template') return m.templateId === templateId;
          if (scope === 'company') return !!companyId && m.companyId === companyId;
          return true;
        })
        .map(([id]) => id);

      const snaps = await Promise.all(
        chunk(jobIds, IN_LIMIT).map((ids) =>
          db.collection('policyCommissionSummaries').where('runId', 'in', ids).select(...POLICY_FIELDS).get()
        )
      );

      const rows: any[] = [];
      for (const snap of snaps) {
        for (const d of snap.docs) {
          const x: any = d.data();
          if (str(x.agentId) !== agentId) continue;
          if (hekefTemplateIds.has(str(x.templateId))) continue;
          if (scope === 'template' && str(x.templateId) !== templateId) continue;
          if (scope === 'company' && str(x.companyId) !== companyId) continue;
          rows.push(x);
        }
      }

      return NextResponse.json({ rows, jobs: jobIds.length });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[commission-comparison/by-ym]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}