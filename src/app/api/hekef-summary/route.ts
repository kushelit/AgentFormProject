import { getHekefSummary } from '@/services/server/hekefSummaryService';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { agentId, year } = await req.json();
  const result = await getHekefSummary({
    agentId,
    fromMonth: `${year}-01`,
    toMonth: `${year}-12`,
  });
  return NextResponse.json(result);
}