// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary-drilldown/route.ts
// תיקון יסודי (כמו בשני ה-endpoints הקודמים): כש-ym מועבר, מצרפים את
// הפוליסות בזמן ריצה מתוך externalCommissions (ה-ledger הגולמי) ולא
// מתוך policyCommissionSummaries הממוזג — כך שפוליסה לא תוצג עם סכום
// שמשלב כמה חודשי-פרסום שונים.
// בלי ym (חודש דיווח) — ללא שינוי, ממשיכים מה-summary הממוזג.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { getDocsByFieldInBatches } from '@/lib/server/firestoreBatch';

function roundTo2(num: number) {
  return Math.round(num * 100) / 100;
}

type DrillRow = {
  policyNumberKey: string;
  customerId: string;
  fullName?: string;
  product?: string;
  templateId: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  commissionRate: number;
  runId?: string;
};

export async function POST(req: NextRequest) {
  const { agentId, companyId, agentCode, reportMonth, templateId, ym } = await req.json();

  if (!agentId || !companyId || !agentCode || !reportMonth) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  try {
    const db = admin.firestore();

    const templatesSnap = await db
      .collection('commissionTemplates')
      .where('isactive', '==', true)
      .get();

    const hekefTemplateIds = new Set(
      templatesSnap.docs.filter((d) => !!d.data().hekefType).map((d) => d.id)
    );

    let rows: DrillRow[] = [];

    if (ym) {
      // ─── מצב "לפי חודש פרסום": externalCommissions, צירוף בזמן ריצה ──────
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
        return NextResponse.json({ rows: [] });
      }

      // 🔧 שימי לב: agentCode לא נכלל כאן ב-where(). externalCommissions
      // הוא ledger גולמי שלא עובר נירמול על agentCode (בשונה מ-
      // commissionSummaries/policyCommissionSummaries, שם יש trim).
      // התאמה מדויקת ב-Firestore נגד ערך מנורמל יכולה לפספס רשומות עם
      // רווחים בקובץ המקור (כמו שראינו במנורה). מסננים agentCode בזיכרון
      // עם trim בשני הצדדים, אחרי השליפה.
      const extraWhere: Array<[string, FirebaseFirestore.WhereFilterOp, any]> = [
        ['agentId', '==', agentId],
        ['companyId', '==', companyId],
        ['reportMonth', '==', String(reportMonth).trim()],
      ];
      if (templateId) {
        extraWhere.push(['templateId', '==', String(templateId).trim()]);
      }

      const externalDocs = await getDocsByFieldInBatches({
        collection: 'externalCommissions',
        field: 'runId',
        values: jobIds,
        extraWhere,
      });

      const targetAgentCode = String(agentCode).trim();

      const map = new Map<string, DrillRow>();

      for (const doc of externalDocs) {
        const r = doc.data() as any;

        // 🔧 השוואה מנורמלת, לא תלויה בניקיון הדאטה הגולמי
        if (String(r.agentCode || '').trim() !== targetAgentCode) continue;

        const tid = String(r.templateId || '');
        if (hekefTemplateIds.has(tid)) continue;

        const policyNumberKey = String(r.policyNumberKey || '').trim();
        const customerId = String(r.customerId || '').trim();
        if (!policyNumberKey || !customerId) continue;

        const key = `${policyNumberKey}_${customerId}_${tid}`;

        if (!map.has(key)) {
          map.set(key, {
            policyNumberKey,
            customerId,
            fullName: r.fullName ? String(r.fullName).trim() : undefined,
            product: r.product ? String(r.product).trim() : undefined,
            templateId: tid,
            totalCommissionAmount: 0,
            totalPremiumAmount: 0,
            commissionRate: 0,
            runId: r.runId,
          });
        }

        const agg = map.get(key)!;
        agg.totalCommissionAmount += Number(r.commissionAmount || 0);
        agg.totalPremiumAmount += Number(r.premium || 0);
        if (!agg.fullName && r.fullName) agg.fullName = String(r.fullName).trim();
        if (!agg.product && r.product) agg.product = String(r.product).trim();
      }

      for (const agg of map.values()) {
        agg.commissionRate =
          agg.totalPremiumAmount > 0
            ? roundTo2((agg.totalCommissionAmount / agg.totalPremiumAmount) * 100)
            : 0;
      }

      rows = Array.from(map.values());
    } else {
      // ─── מצב "לפי חודש דיווח": policyCommissionSummaries הממוזג, ללא שינוי
      let query = db
        .collection('policyCommissionSummaries')
        .where('agentId', '==', agentId)
        .where('companyId', '==', companyId)
        .where('agentCode', '==', String(agentCode).trim())
        .where('reportMonth', '==', String(reportMonth).trim());

      if (templateId) {
        query = query.where('templateId', '==', String(templateId).trim());
      }

      const snap = await query.orderBy('totalCommissionAmount', 'desc').limit(1000).get();

      rows = snap.docs
        .map((d) => {
          const x: any = d.data();
          return {
            policyNumberKey: x.policyNumberKey,
            customerId: x.customerId,
            fullName: x.fullName,
            product: x.product,
            templateId: x.templateId,
            totalCommissionAmount: x.totalCommissionAmount ?? 0,
            totalPremiumAmount: x.totalPremiumAmount ?? 0,
            commissionRate: x.commissionRate ?? 0,
            runId: x.runId,
          };
        })
        .filter((r) => !hekefTemplateIds.has(r.templateId));
    }

    rows.sort((a, b) => b.totalCommissionAmount - a.totalCommissionAmount);

    return NextResponse.json({ rows });
  } catch (err: any) {
    console.error('[commission-summary-drilldown]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}