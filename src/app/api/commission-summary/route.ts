// ═══════════════════════════════════════════════════════════════════
// app/api/commission-summary/route.ts
// תיקון: try/catch + console.error, לעקביות עם שאר ה-endpoints —
// כך ששגיאות (כמו אינדקס חסר) יודפסו בצורה מסודרת ל-logs ולא יקרסו גולמית.
// ═══════════════════════════════════════════════════════════════════

import { getCommissionSummary } from '@/services/server/commissionSummaryService';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { agentId, year } = await req.json();

    if (!agentId || !year) {
      return NextResponse.json({ error: 'missing params (agentId, year)' }, { status: 400 });
    }

    const result = await getCommissionSummary({
      agentId,
      fromMonth: `${year}-01`,
      toMonth: `${year}-12`,
    });

    return NextResponse.json({
      ...result,
      summaryByYmCompany: result.summaryByYmCompany,
    });
  } catch (err: any) {
    console.error('[commission-summary]', err);
    return NextResponse.json({ error: err.message ?? 'server error' }, { status: 500 });
  }
}