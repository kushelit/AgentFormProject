/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  verifySurenseIncomingKey,
} from "./surenseIncomingKey";

/**
 * validateWebhookAgent
 * -------------------------
 * שימוש משותף לכל webhook שמגיע מ-Make.
 *
 * סדר הבדיקה:
 * 1. x-api-key header קיים
 * 2. agentId קיים ב-body
 * 3. ניסיון אימות מול:
 *    agents/{agentId}/secrets/surenseWebhook
 * 4. אם עדיין אין Secret ברמת הסוכן:
 *    fallback ל-systemConfig/reengagementWebhook
 * 5. הסוכן קיים ופעיל ב-users
 */
export class WebhookAuthError extends Error {
  status: number;

  constructor(
    message: string,
    status: number
  ) {
    super(message);

    this.status =
      status;

    this.name =
      "WebhookAuthError";
  }
}

function safeStr(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

async function validateAgentSecret(
  db:
    FirebaseFirestore.Firestore,

  agentId:
    string,

  incomingKey:
    string
): Promise<
  "valid" |
  "invalid" |
  "not_configured"
> {
  const secretSnap =
    await db
      .doc(
        `agents/${agentId}/secrets/surenseWebhook`
      )
      .get();

  if (
    !secretSnap.exists
  ) {
    return "not_configured";
  }

  const secretData =
    secretSnap.data() as any;

  const apiKeyHash =
    safeStr(
      secretData
        ?.apiKeyHash
    );

  if (!apiKeyHash) {
    return "not_configured";
  }

  return verifySurenseIncomingKey(
    incomingKey,
    apiKeyHash
  )
    ? "valid"
    : "invalid";
}

async function validateLegacyConfig(
  db:
    FirebaseFirestore.Firestore,

  agentId:
    string,

  incomingKey:
    string
): Promise<void> {
  const configSnap =
    await db
      .collection(
        "systemConfig"
      )
      .doc(
        "reengagementWebhook"
      )
      .get();

  if (
    !configSnap.exists
  ) {
    throw new WebhookAuthError(
      "Webhook config not found",
      500
    );
  }

  const agents =
    configSnap
      .data()
      ?.agents as
      Record<
        string,
        string
      > |
      undefined;

  if (!agents) {
    throw new WebhookAuthError(
      "Agents map missing in config",
      500
    );
  }

  const expectedKey =
    safeStr(
      agents[
        agentId
      ]
    );

  if (!expectedKey) {
    throw new WebhookAuthError(
      `No API key configured for agent: ${agentId}`,
      403
    );
  }

  if (
    incomingKey !==
    expectedKey
  ) {
    throw new WebhookAuthError(
      "Invalid API key",
      403
    );
  }
}

export async function validateWebhookAgent(
  params: {
    db:
      FirebaseFirestore.Firestore;

    agentId:
      string;

    incomingKey:
      string;
  }
): Promise<void> {
  const {
    db,
    agentId,
    incomingKey,
  } =
    params;

  if (!incomingKey) {
    throw new WebhookAuthError(
      "Missing x-api-key header",
      401
    );
  }

  if (!agentId) {
    throw new WebhookAuthError(
      "Missing agentId in body",
      400
    );
  }

  const agentSecretResult =
    await validateAgentSecret(
      db,
      agentId,
      incomingKey
    );

  if (
    agentSecretResult ===
    "invalid"
  ) {
    throw new WebhookAuthError(
      "Invalid API key",
      403
    );
  }

  if (
    agentSecretResult ===
    "not_configured"
  ) {
    await validateLegacyConfig(
      db,
      agentId,
      incomingKey
    );
  }

  const agentSnap =
    await db
      .collection(
        "users"
      )
      .doc(
        agentId
      )
      .get();

  if (
    !agentSnap.exists
  ) {
    throw new WebhookAuthError(
      `Agent not found: ${agentId}`,
      403
    );
  }

  const agentData =
    agentSnap.data() as any;

  /*
   * תמיכה בשני שמות השדה הקיימים בפרויקט.
   */
  if (
    agentData
      ?.active ===
      false ||
    agentData
      ?.isActive ===
      false
  ) {
    throw new WebhookAuthError(
      `Agent not active: ${agentId}`,
      403
    );
  }
}
