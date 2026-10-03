import { getHekefSummary } from '@/services/server/hekefSummaryService';
import { NextResponse } from 'next/server';
import { guardAgentAccess } from '@/lib/server/auth';

export async function POST(req: Request) {
  const { agentId, year } = await req.json();
  const denied = await guardAgentAccess(req, agentId, 'hekef-summary');
  if (denied) return denied;
  const result = await getHekefSummary({
    agentId,
    fromMonth: `${year}-01`,
    toMonth: `${year}-12`,
  });
  return NextResponse.json(result);
}