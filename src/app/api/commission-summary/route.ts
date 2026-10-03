// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary/route.ts
// lite: true — תשובה קלה למסך הסיכום החדש (ראו commissionSummaryService).
// בלי lite — התשובה זהה לקודמת.
// ═══════════════════════════════════════════════════════════════════

import { getCommissionSummary } from '@/services/server/commissionSummaryService';
import { NextRequest, NextResponse } from 'next/server';
import { guardAgentAccess } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    const { agentId, year, lite } = await req.json();
    const denied = await guardAgentAccess(req, agentId, 'commission-summary');
    if (denied) return denied;

    if (!agentId || !year) {
      return NextResponse.json({ error: 'missing params (agentId, year)' }, { status: 400 });
    }

    const result = await getCommissionSummary({
      agentId,
      fromMonth: `${year}-01`,
      toMonth: `${year}-12`,
      lite: !!lite,
    });

    if (lite) {
      return NextResponse.json({
        companyIdByName: result.companyIdByName,
        summaryByMonthCompany: result.summaryByMonthCompany,
        summaryByYmCompany: result.summaryByYmCompany,
        allMonths: result.allMonths,
        allCompanies: result.allCompanies,
      });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[commission-summary]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}