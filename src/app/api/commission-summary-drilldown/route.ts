// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary-drilldown/route.ts
// פירוט פוליסות למספר סוכן + חודש דיווח (+ תבנית).
//
// ym (חודש פרסום): externalCommissions (ledger גולמי) לפי runId-ים של אותו
//   חודש פרסום — כמו קודם, כדי שפוליסה לא תשלב כמה חודשי פרסום.
//   שיפור: השאילתות רצות במקביל ושולפות רק את השדות הנדרשים.
//   agentCode מסונן בזיכרון עם trim (externalCommissions לא מנורמל).
// בלי ym (חודש דיווח): policyCommissionSummaries הממוזג — כמו קודם.
//
// groupByAgent: true — מחזיר את הפוליסות של כל מספרי הסוכן בבת אחת
//   ({ byAgentCode: { [code]: rows } }). השרת ממילא קורא את כל מספרי הסוכן
//   (הסינון נעשה בזיכרון), כך שזה לא מייקר את השאילתה — והדפדפן טוען את
//   זה מראש כשנפתח חלון "פירוט לפי מספר סוכן", ומעבר בין מספרי סוכן מיידי.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { jobIdsForYm, loadTemplateInfo, queryByRunIds } from '@/lib/server/drillHelpers';

const roundTo2 = (n: number) => Math.round(n * 100) / 100;

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
  const { agentId, companyId, agentCode, reportMonth, templateId, ym, groupByAgent } = await req.json();

  if (!agentId || !companyId || !reportMonth || (!agentCode && !groupByAgent)) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  try {
    const db = admin.firestore();
    const month = String(reportMonth).trim();
    const tidFilter = templateId ? String(templateId).trim() : '';
    const targetAgentCode = String(agentCode ?? '').trim();
    const grouped = !!groupByAgent;

    let rows: Array<DrillRow & { agentCode: string }> = [];

    if (ym) {
      const [{ hekef }, jobIds] = await Promise.all([loadTemplateInfo(db), jobIdsForYm(db, agentId, companyId, ym)]);
      if (!jobIds.length) return NextResponse.json({ rows: [] });

      const where: Array<[string, FirebaseFirestore.WhereFilterOp, any]> = [
        ['agentId', '==', agentId],
        ['companyId', '==', companyId],
        ['reportMonth', '==', month],
      ];
      if (tidFilter) where.push(['templateId', '==', tidFilter]);

      const raw = await queryByRunIds({
        db,
        collection: 'externalCommissions',
        runIds: jobIds,
        where,
        fields: ['agentCode', 'templateId', 'policyNumberKey', 'customerId', 'fullName', 'product', 'commissionAmount', 'premium', 'runId'],
      });

      const map = new Map<string, DrillRow & { agentCode: string }>();
      for (const r of raw) {
        const code = String(r.agentCode || '').trim() || '-';
        if (!grouped && code !== targetAgentCode) continue;
        const tid = String(r.templateId || '');
        if (hekef.has(tid)) continue;

        const policyNumberKey = String(r.policyNumberKey || '').trim();
        const customerId = String(r.customerId || '').trim();
        if (!policyNumberKey || !customerId) continue;

        const key = `${code}_${policyNumberKey}_${customerId}_${tid}`;
        let agg = map.get(key);
        if (!agg) {
          agg = {
            agentCode: code,
            policyNumberKey,
            customerId,
            fullName: r.fullName ? String(r.fullName).trim() : undefined,
            product: r.product ? String(r.product).trim() : undefined,
            templateId: tid,
            totalCommissionAmount: 0,
            totalPremiumAmount: 0,
            commissionRate: 0,
            runId: r.runId,
          };
          map.set(key, agg);
        }
        agg.totalCommissionAmount += Number(r.commissionAmount || 0);
        agg.totalPremiumAmount += Number(r.premium || 0);
        if (!agg.fullName && r.fullName) agg.fullName = String(r.fullName).trim();
        if (!agg.product && r.product) agg.product = String(r.product).trim();
      }

      map.forEach((agg) => {
        agg.commissionRate = agg.totalPremiumAmount > 0 ? roundTo2((agg.totalCommissionAmount / agg.totalPremiumAmount) * 100) : 0;
      });
      rows = Array.from(map.values());
    } else {
      const { hekef } = await loadTemplateInfo(db);
      let q: FirebaseFirestore.Query = db
        .collection('policyCommissionSummaries')
        .where('agentId', '==', agentId)
        .where('companyId', '==', companyId)
        .where('reportMonth', '==', month);
      if (!grouped) q = q.where('agentCode', '==', targetAgentCode);
      if (tidFilter) q = q.where('templateId', '==', tidFilter);

      // במצב מקובץ — בלי orderBy (לא נדרש אינדקס נוסף); המיון נעשה בזיכרון
      const snap = grouped ? await q.get() : await q.orderBy('totalCommissionAmount', 'desc').limit(1000).get();
      rows = snap.docs
        .map((d) => {
          const x: any = d.data();
          return {
            agentCode: String(x.agentCode || '').trim() || '-',
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
        .filter((r) => !hekef.has(r.templateId));
    }

    rows.sort((a, b) => b.totalCommissionAmount - a.totalCommissionAmount);

    if (grouped) {
      const byAgentCode: Record<string, DrillRow[]> = {};
      rows.forEach(({ agentCode: code, ...row }) => (byAgentCode[code] ||= []).push(row));
      return NextResponse.json({ byAgentCode });
    }

    return NextResponse.json({ rows: rows.map(({ agentCode: _c, ...row }) => row) });
  } catch (err: any) {
    console.error('[commission-summary-drilldown]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}