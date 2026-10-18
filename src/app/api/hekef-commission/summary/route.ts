// app/api/hekef-commission/summary/route.ts
// טאב "היקף" — "כל החברות": נטו החודש לפי חברה וחודש עיבוד, לשנה אחת.
//   מנורה / מגדל — סכום התנועות של החודש (commissionSummaries של תבניות hekef_commission).
//   כלל — מה ששולם בפועל לפי דף החשבון: מקדמה (שלילית נדחית → 0) + התחשבנות שנים קודמות.
// "מחכה בסוף השנה" (כלל בלבד) מוחזר בנפרד — הוא לא נכנס לסה"כ, כי עוד לא שולם.

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { guardAgentAccess } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const s = (v: unknown) => String(v ?? '').trim();
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId = s(body?.agentId);
  const denied = await guardAgentAccess(req, agentId, 'hekef-commission-summary');
  if (denied) return denied;
  if (!agentId) return NextResponse.json({ error: 'missing agentId' }, { status: 400 });

  try {
    const db = admin.firestore();

    const tmplSnap = await db.collection('commissionTemplates').where('hekefType', '==', 'hekef_commission').get();
    const templateIds = tmplSnap.docs.map((d) => d.id);
    if (!templateIds.length) return NextResponse.json({ years: [], year: '', companies: [], months: [], pending: [] });

    // נטו לפי חברה + חודש עיבוד, מכל השנים (לבחירת שנה)
    const cells = new Map<string, Map<string, number>>(); // month → companyId → net
    const companyNames = new Map<string, string>();
    const years = new Set<string>();
    const summarySnaps = await Promise.all(
      templateIds.map((tid) =>
        db.collection('commissionSummaries').where('agentId', '==', agentId).where('templateId', '==', tid)
          .select('companyId', 'company', 'reportMonth', 'totalCommissionAmount').get()
      )
    );
    for (const snap of summarySnaps) {
      for (const d of snap.docs) {
        const x = d.data();
        const companyId = s(x.companyId);
        const month = s(x.reportMonth);
        if (!companyId || !/^\d{4}-\d{2}$/.test(month)) continue;
        years.add(month.slice(0, 4));
        if (!companyNames.has(companyId)) companyNames.set(companyId, s(x.company));
        if (!cells.has(month)) cells.set(month, new Map());
        const row = cells.get(month)!;
        row.set(companyId, (row.get(companyId) || 0) + num(x.totalCommissionAmount));
      }
    }

    // כלל: דף החשבון קובע את נטו החודש (מה ששולם בפועל) + מה שמחכה לסוף השנה
    const pendingByCompany = new Map<string, { amount: number; asOf: string }>();
    const stmtSnap = await db.collection('hekefStatements').where('agentId', '==', agentId).get();
    for (const d of stmtSnap.docs) {
      const x = d.data();
      const companyId = s(x.companyId);
      const month = s(x.month);
      if (!companyId || !/^\d{4}-\d{2}$/.test(month)) continue;
      const pay = num(x.currentYear?.payThisMonth);
      const shk = num(x.priorYears?.payThisMonth);
      const paidAdvance = Math.max(0, pay);
      years.add(month.slice(0, 4));
      if (!companyNames.has(companyId)) companyNames.set(companyId, s(x.company));
      if (!cells.has(month)) cells.set(month, new Map());
      cells.get(month)!.set(companyId, paidAdvance + shk);

      const received = num(x.currentYear?.paidPreviousMonths) + paidAdvance;
      const pending = Math.max(0, num(x.currentYear?.totalNetEntitlement) - received);
      const prev = pendingByCompany.get(`${companyId}|${month.slice(0, 4)}`);
      if (!prev || prev.asOf < month) pendingByCompany.set(`${companyId}|${month.slice(0, 4)}`, { amount: pending, asOf: month });
    }

    const yearList = [...years].sort().reverse();
    const year = yearList.includes(s(body?.year)) ? s(body?.year) : yearList[0] || '';

    const months = [...cells.entries()]
      .filter(([m]) => m.startsWith(year))
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, row]) => ({ month, cells: Object.fromEntries([...row.entries()].map(([c, v]) => [c, r2(v)])) }));

    const companyIds = new Set(months.flatMap((m) => Object.keys(m.cells)));
    const companies = [...companyIds]
      .map((companyId) => ({ companyId, company: companyNames.get(companyId) || companyId }))
      .sort((a, b) => a.company.localeCompare(b.company, 'he'));

    const pending = [...pendingByCompany.entries()]
      .filter(([k]) => k.endsWith(`|${year}`))
      .map(([k, v]) => ({ companyId: k.split('|')[0], company: companyNames.get(k.split('|')[0]) || '', amount: r2(v.amount), asOf: v.asOf }))
      .filter((p) => p.amount > 0.5);

    return NextResponse.json({ years: yearList, year, companies, months, pending });
  } catch (err: any) {
    console.error('[hekef-commission/summary]', err);
    return NextResponse.json({ error: err?.message ?? 'server error' }, { status: 500 });
  }
}
