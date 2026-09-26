// ═══════════════════════════════════════════════════════════════════
// app/api/agent-insights/policies/route.ts
// רשימת הפוליסות שמרכיבות קוביית "תיק נוכחי" (צבירה / פרמיה פנסיה / פרמיה ביטוח)
// עבור חברה אחת.
//
// מסלול מהיר: portfolioIndex מהמטמון (נכתב ע"י /api/agent-insights) אומר בדיוק
//   אילו טעינות נבחרו לתיק → שולפים רק את הפוליסות שלהן.
// מסלול גיבוי (אין מטמון): שחזור השרשרת המלאה לחברה.
//
// בשני המסלולים הבחירה עוברת דרך selectPortfolioRows — אותה פונקציה שמחשבת
// את הקוביות, כך שסכום הרשימה זהה לסכום שבקוביה.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { makeResolver, selectPortfolioRows, type InsightsPolicyRow } from '@/lib/insights/computeInsights';
import {
  fetchPolicyRows,
  loadJobMeta,
  loadJobYms,
  loadTemplates,
  type JobMeta,
  type PortfolioIndex,
} from '@/lib/insights/serverData';
import { PORTFOLIO_FIELDS, type PortfolioCategory, type PortfolioPolicyRow } from '@/types/agentInsights';

export const maxDuration = 60;

const UNKNOWN_COMPANY = 'חברה לא ידועה';

export async function POST(req: NextRequest) {
  try {
    const { agentId, year, category, company } = await req.json();
    if (!agentId || !year || !company || !(PORTFOLIO_FIELDS as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'missing params' }, { status: 400 });
    }

    const startedAt = Date.now();
    const db = admin.firestore();
    const yearStr = String(year);

    const [tpl, cacheSnap] = await Promise.all([
      loadTemplates(db),
      db.collection('agentInsightsCache').doc(`${agentId}_${yearStr}`).get(),
    ]);
    const { templatesById, hekefTemplateIds } = tpl;
    const index = (cacheSnap.exists ? cacheSnap.get('portfolioIndex') : null) as PortfolioIndex | null;

    let rows: InsightsPolicyRow[];
    let path: 'index' | 'full';

    if (index) {
      // ─── מסלול מהיר ───────────────────────────────────────────────────
      path = 'index';
      const ymByJobId: Record<string, string> = {};
      const jobMeta: Record<string, JobMeta> = {};
      const reportMonthByTemplate: Record<string, string> = {};

      for (const [templateId, e] of Object.entries(index)) {
        if (!e.companies.includes(company)) continue;
        reportMonthByTemplate[templateId] = e.reportMonth;
        for (const jobId of e.jobIds) {
          ymByJobId[jobId] = e.ym;
          jobMeta[jobId] = { templateId, company, createdAt: 0 };
        }
      }

      rows = (
        await fetchPolicyRows({
          db,
          agentId,
          jobIds: Object.keys(jobMeta),
          ymByJobId,
          jobMeta,
          hekefTemplateIds,
          withDetails: true,
        })
      ).filter((r) => r.company === company && r.reportMonth === reportMonthByTemplate[r.templateId]);
    } else {
      // ─── מסלול גיבוי ──────────────────────────────────────────────────
      path = 'full';
      const ymByJobId = await loadJobYms(db, agentId, yearStr);
      const allMeta = await loadJobMeta(db, Object.keys(ymByJobId), hekefTemplateIds);
      const jobMeta = Object.fromEntries(
        Object.entries(allMeta).filter(([, m]) => !m.company || m.company === company || company === UNKNOWN_COMPANY)
      );
      rows = (
        await fetchPolicyRows({ db, agentId, jobIds: Object.keys(jobMeta), ymByJobId, jobMeta, hekefTemplateIds, withDetails: true })
      ).filter((r) => r.company === company);
    }

    const { selected } = selectPortfolioRows(rows, makeResolver(templatesById));

    const out: PortfolioPolicyRow[] = selected
      .filter((s) => s.category === (category as PortfolioCategory))
      .map(({ row, product, matchedBy }) => ({
        customerId: row.customerId ?? '',
        fullName: row.fullName ?? '',
        policyNumberKey: row.policyNumberKey,
        productRaw: String(row.product ?? '').trim(),
        product,
        matchedBy,
        agentCode: row.agentCode ?? '',
        amount: row.premium,
        templateName: String((templatesById[row.templateId] as any)?.Name ?? row.templateId),
        ym: row.ym,
        reportMonth: row.reportMonth,
      }))
      .sort((a, b) => b.amount - a.amount);

    const total = Math.round(out.reduce((s, r) => s + r.amount, 0) * 100) / 100;

    console.log(
      `[agent-insights/policies] ${agentId}_${yearStr} ${category} ${company}: ` +
        `${out.length} rows via ${path} in ${Date.now() - startedAt}ms`
    );

    return NextResponse.json({ rows: out, total, count: out.length });
  } catch (err: any) {
    console.error('[agent-insights/policies]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}
