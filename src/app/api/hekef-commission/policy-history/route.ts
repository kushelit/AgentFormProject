// app/api/hekef-commission/policy-history/route.ts
// היסטוריית פוליסה בטאב "היקף": כל שורות ההיקף של פוליסה אחת לאורך כל חודשי העיבוד שנטענו.

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { guardAgentAccess } from '@/lib/server/auth';
import { summarizeHekefMonth } from '@/lib/hekef/buildHekefView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const s = (v: unknown) => String(v ?? '').trim();
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId = s(body?.agentId);
  const denied = await guardAgentAccess(req, agentId, 'hekef-commission-policy-history');
  if (denied) return denied;

  const companyId = s(body?.companyId);
  const policyNumber = s(body?.policyNumber);
  const agentCode = s(body?.agentCode);
  if (!agentId || !companyId || !policyNumber) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  try {
    const db = admin.firestore();
    const tmplSnap = await db.collection('commissionTemplates').where('hekefType', '==', 'hekef_commission').get();
    const templateIds = new Set(tmplSnap.docs.filter((d) => s(d.data().companyId) === companyId).map((d) => d.id));
    if (!templateIds.size) return NextResponse.json({ months: [] });

    const snap = await db
      .collection('externalCommissions')
      .where('agentId', '==', agentId)
      .where('policyNumber', '==', policyNumber)
      .get();

    const rows = snap.docs
      .map((d) => d.data())
      .filter((r) => templateIds.has(s(r.templateId)) && (!agentCode || s(r.agentCode) === agentCode));

    const byMonth = new Map<string, any[]>();
    for (const r of rows) {
      const m = s(r.reportMonth);
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m)!.push(r);
    }

    let cumulative = 0;
    const months = [...byMonth.keys()].sort().map((m) => {
      const ls = byMonth.get(m)!;
      const sum = summarizeHekefMonth(ls, m);
      cumulative += sum.net;
      return {
        month: m,
        net: sum.net,
        premium: sum.premium,
        cumulative: Math.round(cumulative * 100) / 100,
        movements: [...new Set(ls.map((r) => s(r.movementType)).filter(Boolean))],
        lines: ls.map((r) => ({
          mv: s(r.movementType),
          kind: s(r.processingType),
          pct: num(r.agentCancelPercent),
          net: num(r.premium),
          c: num(r.commissionAmount),
        })),
      };
    });

    return NextResponse.json({ months });
  } catch (err: any) {
    console.error('[hekef-commission/policy-history]', err);
    return NextResponse.json({ error: err?.message ?? 'server error' }, { status: 500 });
  }
}
