// ═══════════════════════════════════════════════════════════════════
// app/api/commission-comparison/by-ym/route.ts
// נתונים לדף "השוואת טעינות" לפי חודש פרסום (ym).
//
// action: 'listYms'  → חודשי הפרסום שיש לסוכן טעינות שהצליחו בהם (מהחדש לישן)
// action: 'policies' → מסמכי policyCommissionSummaries של חודש פרסום אחד,
//                      לפי רמת ההשוואה (תבנית / חברה / הכל)
// action: 'anomalies' → כמו policies (כל החברות), רק פוליסות חריגות:
//                      עמלה 0 בדיוק או שלילית — בלי עיגול. עמלה חיובית קטנה (0.003)
//                      היא תוצאה לגיטימית של ההסכם ואינה חריגה. משמש את "פוליסות חריגות".
//
// שרשרת חודש פרסום — אותה של הסקירה:
//   portalImportRuns.resolvedWindow.ym → queue.jobIds → commissionImportRuns → runId
// נפרעים בלבד — ללא תבניות hekefType.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { chunk, loadJobMeta, loadJobYms, loadTemplates, str } from '@/lib/insights/serverData';
import { siblingReportFor } from '@/lib/anomalyRules';
import { guardAgentAccess } from '@/lib/server/auth';

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
    const denied = await guardAgentAccess(req, agentId, 'commission-comparison/by-ym');
    if (denied) return denied;
    if (!agentId || !action) return NextResponse.json({ error: 'missing params' }, { status: 400 });

    const db = admin.firestore();
    const { hekefTemplateIds, templatesById } = await loadTemplates(db);

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

      // תבנית נגזרת (derivedFrom, למשל ayalon_zvira) — אין לה ריצות משלה; השורות שלה
      // מגיעות מהריצה של תבנית האם, ולכן מחפשים גם שם (השורות מסוננות לפי templateId בהמשך)
      const parentTemplate = str((templatesById[templateId] as any)?.derivedFrom);
      const jobIds = Object.entries(meta)
        .filter(([, m]) => {
          if (anomaliesOnly) return true;
          if (scope === 'template') return m.templateId === templateId || (!!parentTemplate && m.templateId === parentTemplate);
          if (scope === 'company') return !!companyId && m.companyId === companyId;
          return true;
        })
        .map(([id]) => id);

      const startedAt = Date.now();
      const snaps = await Promise.all(
        chunk(jobIds, IN_LIMIT).map((ids) => {
          let q: FirebaseFirestore.Query = db.collection('policyCommissionSummaries').where('runId', 'in', ids);
          // חריגות: הסינון ב-Firestore עצמו (עמלה <= 0 בדיוק) — נקראות רק החריגות.
          // אינדקס מורכב: runId ASC + totalCommissionAmount ASC (אותו אינדקס כמו קודם).
          if (anomaliesOnly) q = q.where('totalCommissionAmount', '<=', 0);
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
            const commission = Number(x.totalCommissionAmount || 0);
            if (commission > 0) continue;
            rows.push({
              ...x,
              ym,
              totalCommissionAmount: commission,
              totalPremiumAmount: Number(x.totalPremiumAmount || 0),
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
        // ─── דוחות אחים: עמלה לאותה פוליסה בדוח אחר של החברה (lib/anomalyRules) ───
        const bySibling = new Map<string, any[]>(); // siblingTemplateId → חריגות מועמדות
        rows.forEach((r) => {
          const s = siblingReportFor(str(r.templateId), r.product);
          if (s && Number(r.totalCommissionAmount) === 0) {
            const list = bySibling.get(s.sibling) ?? [];
            list.push(r);
            bySibling.set(s.sibling, list);
          }
        });
        for (const [siblingTemplate, candidates] of Array.from(bySibling.entries())) {
          const siblingJobs = Object.entries(meta)
            .filter(([, m]) => m.templateId === siblingTemplate)
            .map(([id]) => id);
          if (!siblingJobs.length) continue;
          const keys = Array.from(new Set(candidates.map((r) => str(r.policyNumberKey)).filter(Boolean)));
          const commissionByKey: Record<string, number> = {};
          const foundKeys = new Set<string>();
          const snaps = await Promise.all(
            siblingJobs.flatMap((job) =>
              chunk(keys, IN_LIMIT).map((ks) =>
                db
                  .collection('policyCommissionSummaries')
                  .where('runId', '==', job)
                  .where('policyNumberKey', 'in', ks)
                  .select('agentId', 'policyNumberKey', 'totalCommissionAmount')
                  .get()
              )
            )
          );
          snaps.forEach((sn) =>
            sn.docs.forEach((d) => {
              const x: any = d.data();
              if (str(x.agentId) !== agentId) return;
              const k = str(x.policyNumberKey);
              foundKeys.add(k);
              commissionByKey[k] = (commissionByKey[k] || 0) + Number(x.totalCommissionAmount || 0);
            })
          );
          candidates.forEach((r) => {
            const k = str(r.policyNumberKey);
            if (foundKeys.has(k)) {
              r.siblingFound = true;
              r.siblingCommission = commissionByKey[k] ?? 0;
              r.siblingTemplate = siblingTemplate;
            }
          });
        }

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