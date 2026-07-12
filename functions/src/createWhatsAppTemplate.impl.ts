/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";
import { PORTAL_ENC_KEY_B64 } from "./shared/secrets";
import { decryptJsonAes256Gcm } from "./shared/cryptoAesGcm";

const WA_API_URL = "https://graph.facebook.com/v25.0";
const MAX_QUICK_REPLY_BUTTONS = 3;

function s(v: any): string {
  return String(v ?? "").trim();
}

function normalizeTemplateName(v: string): string {
  return s(v)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * מחזיר את מספר המשתנים הרציפים בגוף התבנית.
 *
 * לדוגמה:
 * שלום {{1}}, מספר הפנייה שלך הוא {{2}}
 * יחזיר 2.
 */
function getBodyVariableCount(bodyText: string): number {
  const matches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)];

  if (matches.length === 0) {
    return 0;
  }

  const numbers = matches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0);

  const uniqueNumbers = [...new Set(numbers)].sort((a, b) => a - b);

  // Meta מצפה למשתנים רציפים: {{1}}, {{2}}, {{3}}.
  for (let index = 0; index < uniqueNumbers.length; index++) {
    const expectedNumber = index + 1;

    if (uniqueNumbers[index] !== expectedNumber) {
      throw new HttpsError(
        "invalid-argument",
        `Template variables must be sequential. Expected {{${expectedNumber}}}`
      );
    }
  }

  return uniqueNumbers.length;
}

function normalizeBodyExamples(
  rawExamples: unknown,
  variableCount: number
): string[] {
  if (variableCount === 0) {
    return [];
  }

  if (!Array.isArray(rawExamples)) {
    throw new HttpsError(
      "invalid-argument",
      `The template contains ${variableCount} variables, but bodyExamples were not provided`
    );
  }

  const examples = rawExamples.map((value) => s(value));

  if (examples.length !== variableCount) {
    throw new HttpsError(
      "invalid-argument",
      `Expected ${variableCount} body examples, received ${examples.length}`
    );
  }

  if (examples.some((value) => !value)) {
    throw new HttpsError(
      "invalid-argument",
      "All template variable examples must contain a value"
    );
  }

  return examples;
}

function normalizeQuickReplyButtons(rawButtons: unknown): string[] {
  if (!Array.isArray(rawButtons)) {
    return [];
  }

  const buttons = rawButtons
    .map((button) => {
      if (typeof button === "string") {
        return s(button);
      }

      return s((button as any)?.text);
    })
    .filter(Boolean);

  if (buttons.length > MAX_QUICK_REPLY_BUTTONS) {
    throw new HttpsError(
      "invalid-argument",
      `A maximum of ${MAX_QUICK_REPLY_BUTTONS} quick reply buttons is allowed`
    );
  }

  const uniqueButtons = [...new Set(buttons)];

  if (uniqueButtons.length !== buttons.length) {
    throw new HttpsError(
      "invalid-argument",
      "Quick reply button texts must be unique"
    );
  }

  return buttons;
}

export async function createWhatsAppTemplateImpl(
  req: any
): Promise<object> {
  const authUid = req.auth?.uid;

  if (!authUid) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const db = adminDb();

  const userSnap = await (db as any)
    .collection("users")
    .doc(authUid)
    .get();

  if (!userSnap.exists) {
    throw new HttpsError("permission-denied", "User not found");
  }

  const userData = userSnap.data() as any;
  const isAdmin =
    userData?.role === "admin" ||
    userData?.isSystem === true;

  const userAgentId = s(userData?.agentId);

  const allow = Array.isArray(userData?.permissionOverrides?.allow)
    ? userData.permissionOverrides.allow
    : [];

  const hasWhatsAppManagePermission =
    allow.includes("access_whatsapp_manage") ||
    allow.includes("*");

  const body = req.data || {};
  const agentId = s(body.agentId);

  if (!agentId) {
    throw new HttpsError("invalid-argument", "Missing agentId");
  }

  if (!isAdmin) {
    if (!hasWhatsAppManagePermission) {
      throw new HttpsError(
        "permission-denied",
        "Missing WhatsApp manage permission"
      );
    }

    if (!userAgentId || userAgentId !== agentId) {
      throw new HttpsError(
        "permission-denied",
        "Cannot manage WhatsApp templates for another agent"
      );
    }
  }

  const rawName = s(body.name);
  const name = normalizeTemplateName(rawName);
  const category = s(body.category || "MARKETING").toUpperCase();
  const language = s(body.language || "he");
  const bodyText = s(body.bodyText);

  if (!name || !bodyText) {
    throw new HttpsError(
      "invalid-argument",
      "Missing name / bodyText"
    );
  }

  if (
    !["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid template category"
    );
  }

  /*
   * משתנים ודוגמאות
   *
   * bodyExamples אמור להגיע כך:
   * ["ישראל"]
   *
   * עבור גוף שמכיל:
   * שלום {{1}}
   */
  const bodyVariableCount = getBodyVariableCount(bodyText);

  const bodyExamples = normalizeBodyExamples(
    body.bodyExamples,
    bodyVariableCount
  );

  /*
   * כפתורי Quick Reply
   *
   * quickReplyButtons יכול להגיע כך:
   * [
   *   "כן, אשמח לקבוע",
   *   "לא מעוניין כרגע"
   * ]
   *
   * או כך:
   * [
   *   { text: "כן, אשמח לקבוע" },
   *   { text: "לא מעוניין כרגע" }
   * ]
   */
  const quickReplyButtons = normalizeQuickReplyButtons(
    body.quickReplyButtons
  );

  const waConfigSnap = await (db as any)
    .doc(`agents/${agentId}/config/whatsapp`)
    .get();

  if (!waConfigSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp config not found for agent"
    );
  }

  const waConfig = waConfigSnap.data() as any;
  const wabaId = s(waConfig.wabaId);

  if (!wabaId) {
    throw new HttpsError(
      "failed-precondition",
      "Missing wabaId for agent"
    );
  }

  const waSecretSnap = await (db as any)
    .doc(`agents/${agentId}/secrets/whatsapp`)
    .get();

  if (!waSecretSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp token not configured for agent"
    );
  }

  const keyB64 = PORTAL_ENC_KEY_B64.value();

  if (!keyB64) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const waSecret = waSecretSnap.data() as any;

  const { accessToken } = decryptJsonAes256Gcm(
    keyB64,
    waSecret.enc
  ) as any;

  if (!accessToken) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid WhatsApp token for agent"
    );
  }

  const components: any[] = [];

  const bodyComponent: any = {
    type: "BODY",
    text: bodyText,
  };

  if (bodyVariableCount > 0) {
    bodyComponent.example = {
      body_text: [
        bodyExamples,
      ],
    };
  }

  components.push(bodyComponent);

  if (quickReplyButtons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: quickReplyButtons.map((text) => ({
        type: "QUICK_REPLY",
        text,
      })),
    });
  }

  const payload = {
    name,
    category,
    language,
    components,
  };

  console.log(
    "[createWhatsAppTemplate] Creating template:",
    JSON.stringify({
      agentId,
      wabaId,
      name,
      category,
      language,
      bodyVariableCount,
      quickReplyButtons,
    })
  );

  const res = await fetch(
    `${WA_API_URL}/${wabaId}/message_templates`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const json: any = await res.json();

  if (!res.ok) {
    console.error(
      "[createWhatsAppTemplate] Meta error:",
      JSON.stringify(json)
    );

    throw new HttpsError(
      "failed-precondition",
      json?.error?.error_user_msg ||
        json?.error?.message ||
        "Failed to create WhatsApp template"
    );
  }

  const metaTemplateId = s(json.id);
  const templateStatus = s(json.status) || "PENDING";

  const rawQuickReplyActions =
    body.quickReplyActions &&
    typeof body.quickReplyActions === "object"
      ? body.quickReplyActions
      : {};

  const quickReplyActions = quickReplyButtons.reduce(
    (
      result: Record<string, string>,
      buttonText: string
    ) => {
      const action = s(
        rawQuickReplyActions[buttonText]
      );

      if (
        action === "interested" ||
        action === "declined"
      ) {
        result[buttonText] = action;
      }

      return result;
    },
    {}
  );

  const templateRef = (db as any)
    .collection(`agents/${agentId}/whatsapp_templates`)
    .doc(name);

  await templateRef.set(
    {
      name,
      originalName: rawName,
      category,
      language,
      bodyText,

      bodyVariableCount,
      bodyExamples,

      quickReplyButtons,
      hasQuickReplies: quickReplyButtons.length > 0,
      quickReplyActions,

      componentsJson: JSON.stringify(components),

      metaTemplateId,
      status: templateStatus,
      provider: "meta_cloud_api",

      createdAt: nowTs(),
      updatedAt: nowTs(),
      createdBy: authUid,

      metaResponse: json,
    },
    { merge: true }
  );

  await (db as any)
    .doc(`agents/${agentId}/config/whatsapp`)
    .set(
      {
        lastTemplateCreatedAt: nowTs(),
        updatedAt: nowTs(),
        updatedBy: authUid,
      },
      { merge: true }
    );

  return {
    ok: true,
    agentId,
    name,
    category,
    language,
    metaTemplateId,
    status: templateStatus,
    bodyVariableCount,
    quickReplyButtons,
    quickReplyActions,
  };
}