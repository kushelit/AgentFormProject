// ═══════════════════════════════════════════════════════════════════
// app/api/agent-insights/debug/route.ts
// אבחון: למה חברה לא מופיעה בסקירה. עובר על השרשרת שלב אחרי שלב:
//   תבניות החברה → ריצות הסוכן (portalImportRuns) → jobIds → commissionImportRuns
//   → policyCommissionSummaries (מה שהסקירה קוראת) / ymCommissionSummaries (מה שהטבלה קוראת)
//   → פענוח מוצר ושדה פרמיה לדגימת פוליסות.
// מחזיר ספירות, מזהים והגדרות בלבד — בלי שמות ות"ז.
//
// שימוש (בדפדפן):
//   /api/agent-insights/debug?agentId=XXX&year=2026&company=אלטשולר
// בפרודקשן נדרש גם &key=<INSIGHTS_DEBUG_KEY> (משתנה סביבה).
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { makeResolver } from '@/lib/insights/computeInsights';
import { str } from '@/lib/insights/serverData';
import { PORTFOLIO_FIELDS } from '@/types/agentInsights';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const agentId = q.get('agentId') || '';
  const year = q.get('year') || String(new Date().getFullYear());
  const companyQuery = (q.get('company') || '').trim();

  if (process.env.NODE_ENV === 'production' && q.get('key') !== process.env.INSIGHTS_DEBUG_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!agentId || !companyQuery) {
    return NextResponse.json({ error: 'usage: ?agentId=...&year=2026&company=<part of company name>' }, { status: 400 });
  }

  try {
    const db = admin.firestore();

    // ─── 1. חברות + תבניות ─────────────────────────────────────────────
    const [companySnap, templatesSnap] = await Promise.all([db.collection('company').get(), db.collection('commissionTemplates').get()]);
    const companies = companySnap.docs
      .map((d) => ({ id: d.id, name: str((d.data() as any).companyName) }))
      .filter((c) => c.name.includes(companyQuery) || c.id === companyQuery);
    const companyIds = new Set(companies.map((c) => c.id));

    const templatesById: Record<string, any> = {};
    templatesSnap.docs.forEach((d) => (templatesById[d.id] = d.data()));
    const templates = templatesSnap.docs
      .filter((d) => companyIds.has(str((d.data() as any).companyId)))
      .map((d) => {
        const t: any = d.data();
        return {
          templateId: d.id,
          name: t.Name || t.type || '',
          isactive: !!t.isactive,
          hekefType: t.hekefType || null,
          excludedFromOverview: !!t.hekefType,
          defaultPremiumField: t.defaultPremiumField || null,
          fallbackProduct: t.fallbackProduct || null,
          productMapEntries: Object.entries(t.productMap ?? {}).map(([k, e]: any) => ({
            key: k,
            canonicalProduct: e?.canonicalProduct,
            premiumField: e?.premiumField || '(ברירת מחדל)',
            aliases: (e?.aliases ?? []).length,
          })),
        };
      });

    // ─── 2. ריצות הסוכן לחברה ──────────────────────────────────────────
    const portalSnap = await db.collection('portalImportRuns').where('agentId', '==', agentId).get();
    const runs = portalSnap.docs
      .map((d) => ({ id: d.id, x: d.data() as any }))
      .filter(({ x }) => companyIds.has(str(x.companyId)))
      .map(({ id, x }) => ({
        portalRunId: id,
        templateId: str(x.templateId),
        status: str(x.status),
        source: str(x.source),
        ym: str(x?.resolvedWindow?.ym) || '(אין ym)',
        ymInYear: str(x?.resolvedWindow?.ym).startsWith(`${year}-`),
        jobIds: (Array.isArray(x?.queue?.jobIds) ? x.queue.jobIds : []).map(str),
      }))
      .sort((a, b) => a.ym.localeCompare(b.ym));

    // ─── 3. לכל job: ריצה + פוליסות + ym summaries ────────────────────
    const resolve = makeResolver(templatesById);
    const jobs = [];
    for (const r of runs.filter((x) => x.ymInYear)) {
      for (const jobId of r.jobIds) {
        const runDoc = await db.collection('commissionImportRuns').doc(jobId).get();
        let runByField = null as any;
        if (!runDoc.exists) {
          const s = await db.collection('commissionImportRuns').where('runId', '==', jobId).limit(1).get();
          runByField = s.empty ? null : { docId: s.docs[0].id, ...(s.docs[0].data() as any) };
        }
        const runData: any = runDoc.exists ? runDoc.data() : runByField;
        const templateId = str(runData?.templateId);

        const [policyCount, ymCount, policySample] = await Promise.all([
          db.collection('policyCommissionSummaries').where('runId', '==', jobId).count().get(),
          db.collection('ymCommissionSummaries').where('runId', '==', jobId).count().get(),
          db
            .collection('policyCommissionSummaries')
            .where('runId', '==', jobId)
            .select('agentId', 'templateId', 'reportMonth', 'product', 'totalPremiumAmount', 'totalCommissionAmount')
            .limit(5)
            .get(),
        ]);

        jobs.push({
          ym: r.ym,
          jobId,
          commissionImportRun: runDoc.exists ? 'found by doc id' : runByField ? `found by runId field (doc ${runByField.docId})` : 'NOT FOUND',
          runTemplateId: templateId || null,
          runTemplateIsHekef: templateId ? !!templatesById[templateId]?.hekefType : null,
          policyCommissionSummaries: policyCount.data().count,
          ymCommissionSummaries: ymCount.data().count,
          policySample: policySample.docs.map((d) => {
            const x: any = d.data();
            const res = resolve(str(x.templateId) || templateId, x.product);
            return {
              agentIdMatches: str(x.agentId) === agentId,
              templateId: str(x.templateId),
              reportMonth: str(x.reportMonth),
              productRaw: x.product ?? null,
              canonicalProduct: res.canonical,
              premiumField: res.premiumField ?? null,
              countsInPortfolioKpi: (PORTFOLIO_FIELDS as readonly string[]).includes(res.premiumField ?? ''),
              premium: x.totalPremiumAmount,
              commission: x.totalCommissionAmount,
            };
          }),
        });
      }
    }

    // ─── 4. מטמון הסקירה — האם החברה בפנים ─────────────────────────────
    const cache = await db.collection('agentInsightsCache').doc(`${agentId}_${year}`).get();
    const ins: any = cache.exists ? cache.get('insights') : null;
    const inCache = ins
      ? {
          cacheVersion: cache.get('v') ?? null,
          incomeCompanies: (ins.income?.byCompany ?? []).map((c: any) => c.company).filter((n: string) => n.includes(companyQuery)),
          zviraCompanies: (ins.portfolio?.categories?.finansimZvira?.byCompany ?? [])
            .map((c: any) => c.company)
            .filter((n: string) => n.includes(companyQuery)),
          productCompanies: Array.from(
            new Set((ins.products?.byCompany ?? []).map((r: any) => r.company).filter((n: string) => n.includes(companyQuery)))
          ),
          staleTemplates: (ins.portfolio?.staleTemplates ?? []).filter((t: any) => String(t.companyName).includes(companyQuery)),
        }
      : 'no cache doc';

    return NextResponse.json(
      {
        agentId,
        year,
        companies,
        templates,
        portalRuns: runs.map(({ jobIds, ...r }) => ({ ...r, jobs: jobIds.length })),
        jobs,
        overviewCache: inCache,
      },
      { headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  } catch (err: any) {
    console.error('[agent-insights/debug]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}