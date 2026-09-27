// ═══════════════════════════════════════════════════════════════════
// app/api/commission-comparison/by-ym/route.ts
// נתונים לדף "השוואת טעינות" לפי חודש פרסום (ym).
//
// action: 'listYms'  → חודשי הפרסום שיש לסוכן טעינות שהצליחו בהם (מהחדש לישן)
// action: 'policies' → מסמכי policyCommissionSummaries של חודש פרסום אחד,
//                      לפי רמת ההשוואה (תבנית / חברה / הכל)
// action: 'anomalies' → כמו policies (כל החברות), רק פוליסות חריגות:
//                      עמלה 0 או שלילית (מעוגל ל-2 ספרות). משמש את "פוליסות חריגות".
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
  'fullName', 'runId', 'validMonth',
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

    // ─── פוליסות של חודש פרסום (או רק החריגות שבהן) ──────────────────────
    if (action === 'policies' || action === 'anomalies') {
      const anomaliesOnly = action === 'anomalies';
      if (!/^\d{4}-\d{2}$/.test(String(ym ?? ''))) {
        return NextResponse.json({ error: 'bad ym' }, { status: 400 });
      }

      const ymByJobId = await loadJobYms(db, agentId, String(ym).slice(0, 4));
      const jobIdsOfYm = Object.keys(ymByJobId).filter((id) => ymByJobId[id] === ym);
      const meta = await loadJobMeta(db, jobIdsOfYm, hekefTemplateIds);

      const jobIds = Object.entries(meta)
        .filter(([, m]) => {
          if (anomaliesOnly) return true;
          if (scope === 'template') return m.templateId === templateId;
          if (scope === 'company') return !!companyId && m.companyId === companyId;
          return true;
        })
        .map(([id]) => id);

      const startedAt = Date.now();
      const snaps = await Promise.all(
        chunk(jobIds, IN_LIMIT).map((ids) => {
          let q: FirebaseFirestore.Query = db.collection('policyCommissionSummaries').where('runId', 'in', ids);
          // חריגות: הסינון ב-Firestore עצמו (עמלה < 0.005 = 0 או שלילית אחרי עיגול) —
          // נקראות רק החריגות, לא כל פוליסות החודש.
          // דורש אינדקס מורכב: runId ASC + totalCommissionAmount ASC
          // (בפעם הראשונה Firestore מחזיר שגיאה עם לינק ליצירתו — בלוג השרת).
          if (anomaliesOnly) q = q.where('totalCommissionAmount', '<', 0.005);
          return q.select(...POLICY_FIELDS).get();
        })
      );

      const rows: any[] = [];
      for (const snap of snaps) {
        for (const d of snap.docs) {
          const x: any = d.data();
          if (str(x.agentId) !== agentId) continue;
          if (hekefTemplateIds.has(str(x.templateId))) continue;
          if (anomaliesOnly) {
            const commission = Math.round(Number(x.totalCommissionAmount || 0) * 100) / 100;
            if (commission > 0) continue;
            rows.push({
              ...x,
              ym,
              totalCommissionAmount: commission,
              totalPremiumAmount: Math.round(Number(x.totalPremiumAmount || 0) * 100) / 100,
              commissionRate: Number(x.commissionRate || 0),
            });
            continue;
          }
          if (scope === 'template' && str(x.templateId) !== templateId) continue;
          if (scope === 'company' && str(x.companyId) !== companyId) continue;
          rows.push(x);
        }
      }

      console.log(
        `[by-ym] ${action} ${agentId} ${ym}: ${jobIds.length} jobs, ` +
          `${snaps.reduce((n, s) => n + s.size, 0)} docs read, ${rows.length} rows in ${Date.now() - startedAt}ms`
      );

      if (anomaliesOnly) {
        rows.sort((a, b) => a.totalCommissionAmount - b.totalCommissionAmount);
        return NextResponse.json({ rows, total: rows.length, jobs: jobIds.length });
      }
      return NextResponse.json({ rows, jobs: jobIds.length });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[commission-comparison/by-ym]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}