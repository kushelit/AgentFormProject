// app/api/hekef-commission/route.ts
// טאב "היקף": חודשי העיבוד הזמינים לסוכן, מגמה לאורך החודשים, והתצוגה של חודש וחברה אחד,
// מתוך externalCommissions של תבניות hekefType = hekef_commission.
//
// מגמה: הפירוק של כל חודש (הפקה / ביטולים / שוטף / רטרו...) מחושב מהשורות בפעם הראשונה
// ונשמר ב-hekefMonthCache. המטמון נבנה מחדש כשה-runIds של החודש משתנים (החודש נטען מחדש),
// כך שאין צורך לגעת בתהליך הטעינה.

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { guardAgentAccess } from '@/lib/server/auth';
import { buildHekefView, summarizeHekefMonth, type HekefMonthSummary } from '@/lib/hekef/buildHekefView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const s = (v: unknown) => String(v ?? '').trim();
const TREND_MONTHS = 24;

type MonthInfo = { net: number; runIds: Set<string> };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId = s(body?.agentId);
  const denied = await guardAgentAccess(req, agentId, 'hekef-commission');
  if (denied) return denied;
  if (!agentId) return NextResponse.json({ error: 'missing agentId' }, { status: 400 });

  try {
    const db = admin.firestore();

    const tmplSnap = await db.collection('commissionTemplates').where('hekefType', '==', 'hekef_commission').get();
    const templateCompany = new Map(tmplSnap.docs.map((d) => [d.id, s(d.data().companyId)]));
    if (!templateCompany.size) return NextResponse.json({ enabled: false, companies: [] });

    // חודשים וחברות זמינים — מהסיכומים (קטנים) ולא מהשורות
    const companies = new Map<string, { companyId: string; company: string; months: Map<string, MonthInfo> }>();
    for (const templateId of templateCompany.keys()) {
      const snap = await db
        .collection('commissionSummaries')
        .where('agentId', '==', agentId)
        .where('templateId', '==', templateId)
        .get();
      for (const d of snap.docs) {
        const x = d.data();
        const companyId = s(x.companyId);
        const month = s(x.reportMonth);
        if (!companyId || !month) continue;
        if (!companies.has(companyId)) companies.set(companyId, { companyId, company: s(x.company), months: new Map() });
        const months = companies.get(companyId)!.months;
        if (!months.has(month)) months.set(month, { net: 0, runIds: new Set() });
        const m = months.get(month)!;
        m.net += Number(x.totalCommissionAmount || 0);
        if (s(x.runId)) m.runIds.add(s(x.runId));
      }
    }

    const companyList = [...companies.values()]
      .map((c) => ({
        companyId: c.companyId,
        company: c.company,
        months: [...c.months.entries()]
          .map(([month, m]) => ({ month, net: Math.round(m.net * 100) / 100 }))
          .sort((a, b) => b.month.localeCompare(a.month)),
      }))
      .sort((a, b) => a.company.localeCompare(b.company, 'he'));

    if (!companyList.length) return NextResponse.json({ enabled: true, companies: [], view: null, trend: [] });

    const company = companyList.find((c) => c.companyId === s(body?.companyId)) || companyList[0];
    const month = company.months.some((m) => m.month === s(body?.reportMonth))
      ? s(body?.reportMonth)
      : company.months[0].month;

    const companyTemplates = [...templateCompany].filter(([, cid]) => cid === company.companyId).map(([tid]) => tid);
    const loadRows = async (m: string) => {
      const rows: any[] = [];
      for (const templateId of companyTemplates) {
        const snap = await db
          .collection('externalCommissions')
          .where('agentId', '==', agentId)
          .where('templateId', '==', templateId)
          .where('reportMonth', '==', m)
          .get();
        snap.docs.forEach((d) => rows.push(d.data()));
      }
      return rows;
    };

    const monthInfo = companies.get(company.companyId)!.months;
    const signature = (m: string) => [...(monthInfo.get(m)?.runIds || [])].sort().join(',');
    const cacheRef = (m: string) => db.collection('hekefMonthCache').doc(`${agentId}_${company.companyId}_${m}`);
    const saveCache = (m: string, summary: HekefMonthSummary) =>
      cacheRef(m)
        .set({ agentId, companyId: company.companyId, month: m, runIds: signature(m), summary, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
        .catch((e) => console.error('[hekef-commission] cache write failed', e));

    // החודש הנבחר — תצוגה מלאה מהשורות
    const selectedRows = await loadRows(month);
    const view = buildHekefView(selectedRows, month);

    // מגמה — מהמטמון, או חישוב מהשורות כשאין מטמון / החודש נטען מחדש
    const trendMonths = company.months.slice(0, TREND_MONTHS).map((m) => m.month);
    const cacheSnaps = await db.getAll(...trendMonths.map(cacheRef));
    const trend: HekefMonthSummary[] = [];
    for (let i = 0; i < trendMonths.length; i++) {
      const m = trendMonths[i];
      const cached = cacheSnaps[i].exists ? cacheSnaps[i].data() : null;
      if (cached && cached.runIds === signature(m) && cached.summary) {
        trend.push(cached.summary as HekefMonthSummary);
        continue;
      }
      const summary = summarizeHekefMonth(m === month ? selectedRows : await loadRows(m), m);
      trend.push(summary);
      await saveCache(m, summary);
    }
    trend.sort((a, b) => a.month.localeCompare(b.month));

    // דף חשבון חודשי (כלל) — אם הטעינה חילצה אחד לחודש הזה
    const statementSnap = await db.collection('hekefStatements').doc(`${agentId}_${company.companyId}_${month}`).get();
    const statementData = statementSnap.exists ? statementSnap.data() : null;
    const statement = statementData ? { ...statementData, updatedAt: null } : null;

    return NextResponse.json({
      enabled: true,
      companies: companyList,
      companyId: company.companyId,
      month,
      view,
      trend,
      statement,
    });
  } catch (err: any) {
    console.error('[hekef-commission]', err);
    return NextResponse.json({ error: err?.message ?? 'server error' }, { status: 500 });
  }
}
