import { NextResponse } from 'next/server';
import { getAdminCommissionSummaryMatrix } from '@/services/server/adminCommissionSummaryService';

export async function POST(req: Request) {
  try {
    const { year, agentIds } = await req.json();

    if (!year) {
      return NextResponse.json(
        { error: 'year is required' },
        { status: 400 }
      );
    }

    if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json(
        { error: 'agentIds is required (non-empty array)' },
        { status: 400 }
      );
    }

    const result = await getAdminCommissionSummaryMatrix({
      agentIds,
      fromMonth: `${year}-01`,
      toMonth: `${year}-12`,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('admin commission-summary-matrix error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
