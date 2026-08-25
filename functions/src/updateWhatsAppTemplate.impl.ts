/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./shared/admin";
import { PORTAL_ENC_KEY_B64 } from "./shared/secrets";
import { decryptJsonAes256Gcm } from "./shared/cryptoAesGcm";
import { requireBackendPermission } from "./shared/backendPermissions";

const WA_API_URL = "https://graph.facebook.com/v25.0";
const MAX_QUICK_REPLY_BUTTONS = 3;
const ALLOWED_QUICK_REPLY_ACTIONS = new Set([
  "interested",
  "declined",
  "booking",
  "other",
]);

function s(value: any): string {
  return String(value ?? "").trim();
}

function getBodyVariableCount(bodyText: string): number {
  const matches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)];
  if (matches.length === 0) return 0;

  const numbers = matches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value > 0);

  const uniqueNumbers = [...new Set(numbers)].sort((a, b) => a - b);

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

function normalizeBodyExamples(rawExamples: unknown, variableCount: number): string[] {
  if (variableCount === 0) return [];

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
  if (!Array.isArray(rawButtons)) return [];

  const buttons = rawButtons
    .map((button) =>
      typeof button === "string" ? s(button) : s((button as any)?.text)
    )
    .filter(Boolean);

  if (buttons.length > MAX_QUICK_REPLY_BUTTONS) {
    throw new HttpsError(
      "invalid-argument",
      `A maximum of ${MAX_QUICK_REPLY_BUTTONS} quick reply buttons is allowed`
    );
  }

  if (new Set(buttons).size !== buttons.length) {
    throw new HttpsError(
      "invalid-argument",
      "Quick reply button texts must be unique"
    );
  }

  return buttons;
}

function normalizeHttpUrl(value: unknown): string {
  const raw = s(value);
  if (!raw) return "";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HttpsError("invalid-argument", "Invalid URL button URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new HttpsError(
      "invalid-argument",
      "URL button must use http:// or https://"
    );
  }

  return parsed.toString();
}

function normalizeUrlButton(rawButton: unknown): { text: string; url: string } | null {
  if (!rawButton || typeof rawButton !== "object") return null;

  const text = s((rawButton as any)?.text);
  const rawUrl = s((rawButton as any)?.url);

  if (!text && !rawUrl) return null;

  if (!text || !rawUrl) {
    throw new HttpsError(
      "invalid-argument",
      "URL button requires both text and url"
    );
  }

  return {
    text,
    url: normalizeHttpUrl(rawUrl),
  };
}

async function parseMetaResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function updateWhatsAppTemplateImpl(req: any): Promise<object> {
  const authUid = req.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Login required");

  const db = adminDb();

  const userSnap = await (db as any).collection("users").doc(authUid).get();
  if (!userSnap.exists) {
    throw new HttpsError("permission-denied", "User not found");
  }

  const userData = userSnap.data() as any;

  await requireBackendPermission({
    db: db as any,
    userId: authUid,
    userData,
    permission: "access_magic_touch",
  });

  const isAdmin = userData?.role === "admin" || userData?.isSystem === true;
  const userAgentId = s(userData?.agentId);

  const body = req.data || {};
  const agentId = s(body.agentId);
  const templateName = s(body.name);
  const metaTemplateId = s(body.metaTemplateId);

  if (!agentId || !templateName || !metaTemplateId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId / name / metaTemplateId"
    );
  }

  if (!isAdmin && (!userAgentId || userAgentId !== agentId)) {
    throw new HttpsError(
      "permission-denied",
      "Cannot manage WhatsApp templates for another agent"
    );
  }

  const category = s(body.category || "MARKETING").toUpperCase();
  const language = s(body.language || "he");
  const bodyText = s(body.bodyText);

  if (!bodyText) {
    throw new HttpsError("invalid-argument", "Missing bodyText");
  }

  if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category)) {
    throw new HttpsError("invalid-argument", "Invalid template category");
  }

  const bodyVariableCount = getBodyVariableCount(bodyText);
  const bodyExamples = normalizeBodyExamples(
    body.bodyExamples,
    bodyVariableCount
  );
  const quickReplyButtons = normalizeQuickReplyButtons(body.quickReplyButtons);
  const urlButton = normalizeUrlButton(body.urlButton);

  const templateRef = (db as any).doc(
    `agents/${agentId}/whatsapp_templates/${templateName}`
  );
  const templateSnap = await templateRef.get();

  if (!templateSnap.exists) {
    throw new HttpsError("not-found", "Template not found in MagicTouch");
  }

  const existingTemplate = templateSnap.data() as any;
  const storedMetaTemplateId = s(existingTemplate?.metaTemplateId);

  if (storedMetaTemplateId && storedMetaTemplateId !== metaTemplateId) {
    throw new HttpsError(
      "failed-precondition",
      "Template ID does not match the stored template"
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
    throw new HttpsError("internal", "Missing encryption key");
  }

  const { accessToken } = decryptJsonAes256Gcm(
    keyB64,
    (waSecretSnap.data() as any).enc
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
      body_text: [bodyExamples],
    };
  }

  components.push(bodyComponent);

  const templateButtons: any[] = [];

  for (const text of quickReplyButtons) {
    templateButtons.push({
      type: "QUICK_REPLY",
      text,
    });
  }

  if (urlButton) {
    templateButtons.push({
      type: "URL",
      text: urlButton.text,
      url: urlButton.url,
    });
  }

  if (templateButtons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: templateButtons,
    });
  }

  const updatePayload = {
    name: templateName,
    category,
    language,
    components,
  };

  const updateResponse = await fetch(
    `${WA_API_URL}/${metaTemplateId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatePayload),
    }
  );

  const updateJson = await parseMetaResponse(updateResponse);

  if (!updateResponse.ok) {
    console.error(
      "[updateWhatsAppTemplate] Meta update error:",
      JSON.stringify(updateJson)
    );

    throw new HttpsError(
      "failed-precondition",
      updateJson?.error?.error_user_msg ||
        updateJson?.error?.message ||
        "Failed to update WhatsApp template"
    );
  }

  let refreshedTemplate: any = null;

  try {
    const fields = [
      "id",
      "name",
      "status",
      "category",
      "language",
      "components",
    ].join(",");

    const refreshResponse = await fetch(
      `${WA_API_URL}/${metaTemplateId}?fields=${encodeURIComponent(fields)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (refreshResponse.ok) {
      refreshedTemplate = await parseMetaResponse(refreshResponse);
    }
  } catch (error: any) {
    console.warn(
      "[updateWhatsAppTemplate] Could not refresh template after update",
      error?.message || String(error)
    );
  }

  const rawQuickReplyActions =
    body.quickReplyActions && typeof body.quickReplyActions === "object"
      ? body.quickReplyActions
      : {};

  const quickReplyActions = quickReplyButtons.reduce(
    (result: Record<string, string>, buttonText: string) => {
      const action = s(rawQuickReplyActions[buttonText]);

      if (ALLOWED_QUICK_REPLY_ACTIONS.has(action)) {
        result[buttonText] = action;
      }

      return result;
    },
    {}
  );

  const nextStatus =
    s(refreshedTemplate?.status) ||
    s(existingTemplate?.status) ||
    "PENDING";

  await templateRef.set(
    {
      category: s(refreshedTemplate?.category) || category,
      language: s(refreshedTemplate?.language) || language,
      status: nextStatus,
      bodyText,
      bodyVariableCount,
      bodyExamples,
      quickReplyButtons,
      hasQuickReplies: quickReplyButtons.length > 0,
      quickReplyActions,
      urlButton,
      hasUrlButton: Boolean(urlButton),
      componentsJson: JSON.stringify(
        refreshedTemplate?.components || components
      ),
      metaResponseJson: refreshedTemplate
        ? JSON.stringify(refreshedTemplate)
        : null,
      lastEditedAt: nowTs(),
      updatedAt: nowTs(),
      updatedBy: authUid,
    },
    { merge: true }
  );

  await (db as any).doc(`agents/${agentId}/config/whatsapp`).set(
    {
      lastTemplateUpdatedAt: nowTs(),
      updatedAt: nowTs(),
      updatedBy: authUid,
    },
    { merge: true }
  );

  return {
    ok: true,
    agentId,
    name: templateName,
    metaTemplateId,
    status: nextStatus,
    bodyText,
    bodyVariableCount,
    quickReplyButtons,
    quickReplyActions,
    urlButton,
    meta: updateJson,
  };
}
