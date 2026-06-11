/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * validateWebhookAgent
 * -------------------------
 * שימוש משותף לכל webhook שמגיע מ-Make.
 * בודק:
 * 1. x-api-key header קיים
 * 2. agentId קיים ב-body
 * 3. agents[agentId] == incomingKey ב-systemConfig/reengagementWebhook
 * 4. הסוכן קיים ופעיל ב-users collection
 *
 * זורק WebhookAuthError עם status + message במקרה של כשל.
 */

export class WebhookAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "WebhookAuthError";
  }
}

function safeStr(v: any): string {
  return String(v ?? "").trim();
}

export async function validateWebhookAgent(params: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  incomingKey: string;
}): Promise<void> {
  const { db, agentId, incomingKey } = params;

  if (!incomingKey) {
    throw new WebhookAuthError("Missing x-api-key header", 401);
  }

  if (!agentId) {
    throw new WebhookAuthError("Missing agentId in body", 400);
  }

  // ✅ בדיקת KEY פר סוכן
  const configSnap = await db.collection("systemConfig").doc("reengagementWebhook").get();
  if (!configSnap.exists) {
    throw new WebhookAuthError("Webhook config not found", 500);
  }

  const agents = configSnap.data()?.agents as Record<string, string> | undefined;
  if (!agents) {
    throw new WebhookAuthError("Agents map missing in config", 500);
  }

  const expectedKey = safeStr(agents[agentId]);
  if (!expectedKey) {
    throw new WebhookAuthError(`No API key configured for agent: ${agentId}`, 403);
  }

  if (incomingKey !== expectedKey) {
    throw new WebhookAuthError("Invalid API key", 403);
  }

  // ✅ וידוא שהסוכן קיים ופעיל
  const agentSnap = await db.collection("users").doc(agentId).get();
  if (!agentSnap.exists) {
    throw new WebhookAuthError(`Agent not found: ${agentId}`, 403);
  }

  const agentData = agentSnap.data() as any;
  if (agentData?.active === false) {
    throw new WebhookAuthError(`Agent not active: ${agentId}`, 403);
  }
}