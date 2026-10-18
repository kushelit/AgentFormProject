// app/api/admin/agent-deletion/route.ts
// System admin only (always enforced, regardless of API_AUTH_MODE): full deletion of an agent who left.
// action: 'list' | 'preview' | 'delete'. 'delete' requires typing the agent's name and runs in rounds (done=false → call again).

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import {
  AgentDeletionError,
  listDeletionCandidates,
  previewAgentDeletion,
  runAgentDeletion,
} from '@/lib/server/agentDeletion';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (!user.isSystem) return NextResponse.json({ error: 'רק מנהלת מערכת' }, { status: 403 });

  try {
    const { action, agentId, confirmName } = await req.json();
    const id = String(agentId ?? '').trim();

    if (action === 'list') return NextResponse.json({ agents: await listDeletionCandidates() });

    if (action === 'preview') return NextResponse.json(await previewAgentDeletion(id, user.uid));

    if (action === 'delete') {
      const { agent } = await checkConfirmName(id, user.uid, confirmName);
      console.warn(`[admin/agent-deletion] round for ${id} (${agent.name}) by ${user.uid}`);
      return NextResponse.json(await runAgentDeletion(id, { uid: user.uid, name: String(user.data.name ?? '') }));
    }

    return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });
  } catch (e: any) {
    if (e instanceof AgentDeletionError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error('[admin/agent-deletion]', e);
    return NextResponse.json({ error: 'הפעולה נכשלה. אפשר להריץ שוב — המחיקה ממשיכה מהמקום שבו עצרה.' }, { status: 500 });
  }
}

/** The typed text must match the agent's name exactly (or the email when there is no name). */
async function checkConfirmName(agentId: string, callerUid: string, confirmName: unknown) {
  const candidates = await listDeletionCandidates();
  const agent = candidates.find((a) => a.agentId === agentId);
  if (!agent) throw new AgentDeletionError('אפשר למחוק רק סוכן בסטטוס עזיבה (מנוי מבוטל)');
  if (agentId === callerUid) throw new AgentDeletionError('אי אפשר למחוק את המשתמש המחובר');
  const expected = agent.name || agent.email;
  if (!expected || String(confirmName ?? '').trim() !== expected) {
    throw new AgentDeletionError('הטקסט שהוקלד לא תואם לשם הסוכן');
  }
  return { agent };
}
