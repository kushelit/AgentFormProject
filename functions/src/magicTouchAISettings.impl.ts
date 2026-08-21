/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

export type MagicTouchAIMode =
  | "off"
  | "understand_only"
  | "safe_replies"
  | "full_conversation";

export type MagicTouchAITone =
  | "friendly"
  | "professional"
  | "formal"
  | "concise";

export type MagicTouchAIEmojiLevel =
  | "none"
  | "light"
  | "free";

export interface MagicTouchAIConversationProfile {
  tone:
    MagicTouchAITone;

  useCustomerFirstName:
    boolean;

  emojiLevel:
    MagicTouchAIEmojiLevel;

  customStyleInstructions:
    string;
}

export interface EffectiveMagicTouchAISettings {
  enabled:
    boolean;

  mode:
    MagicTouchAIMode;

  minConfidence:
    number;

  conversationProfile:
    MagicTouchAIConversationProfile;
}

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function requireAuth(
  request: any
): string {
  const uid =
    s(
      request.auth?.uid
    );

  if (
    !uid
  ) {
    throw new HttpsError(
      "unauthenticated",
      "Authentication is required"
    );
  }

  return uid;
}

function normalizeMode(
  value: unknown
): MagicTouchAIMode {
  const mode =
    s(
      value
    );

  if (
    mode === "understand_only" ||
    mode === "safe_replies" ||
    mode === "full_conversation"
  ) {
    return mode;
  }

  return "off";
}

function normalizeTone(
  value: unknown
): MagicTouchAITone {
  const tone =
    s(
      value
    );

  if (
    tone === "professional" ||
    tone === "formal" ||
    tone === "concise"
  ) {
    return tone;
  }

  return "friendly";
}

function normalizeEmojiLevel(
  value: unknown
): MagicTouchAIEmojiLevel {
  const level =
    s(
      value
    );

  if (
    level === "none" ||
    level === "free"
  ) {
    return level;
  }

  return "light";
}

function normalizeConfidence(
  value: unknown
): number {
  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 0.8;
  }

  return Math.max(
    0,
    Math.min(
      1,
      parsed
    )
  );
}

function normalizeAllowedModes(
  value: unknown
): MagicTouchAIMode[] {
  const rawModes =
    Array.isArray(
      value
    )
      ? value
      : [];

  const normalized =
    Array.from(
      new Set(
        rawModes.map(
          (
            mode
          ) =>
            normalizeMode(
              mode
            )
        )
      )
    );

  /*
   * off תמיד חייב להיות אפשרי.
   */
  if (
    !normalized.includes(
      "off"
    )
  ) {
    normalized.unshift(
      "off"
    );
  }

  return normalized;
}

async function getUserContext(
  uid: string
) {
  const db =
    adminDb();

  const userSnap =
    await db
      .doc(
        `users/${uid}`
      )
      .get();

  if (
    !userSnap.exists
  ) {
    throw new HttpsError(
      "permission-denied",
      "User profile was not found"
    );
  }

  const data =
    userSnap.data() ||
    {};

  return {
    uid,

    isSystem:
      data?.isSystem ===
      true,

    agentId:
      s(
        data?.agentId
      ) ||
      null,
  };
}

function getDefaultSystemSettings() {
  return {
    enabled:
      false,

    allowedModes: [
      "off",
    ] as MagicTouchAIMode[],

    defaultMode:
      "off" as MagicTouchAIMode,
  };
}

function getDefaultAgentSettings(
  defaultMode:
    MagicTouchAIMode
) {
  return {
    enabled:
      false,

    mode:
      defaultMode,

    minConfidence:
      0.8,

    conversationProfile: {
      tone:
        "friendly" as MagicTouchAITone,

      useCustomerFirstName:
        true,

      emojiLevel:
        "light" as MagicTouchAIEmojiLevel,

      customStyleInstructions:
        "",
    },
  };
}

/*
 * ---------------------------------------------------------
 * SHARED SETTINGS RESOLVER
 * ---------------------------------------------------------
 *
 * זהו מקור האמת המשותף ל-UI ולמנוע השיחה.
 *
 * הוא קורא:
 * systemConfig/magicTouchAI
 * agents/{agentId}/config/magicTouchAI
 *
 * ומחשב את ההגדרות האפקטיביות.
 */
async function loadMagicTouchAISettings(
  agentId:
    string
) {
  const normalizedAgentId =
    s(
      agentId
    );

  if (
    !normalizedAgentId
  ) {
    throw new Error(
      "agentId is required"
    );
  }

  const db =
    adminDb();

  const systemRef =
    db.doc(
      "systemConfig/magicTouchAI"
    );

  const agentRef =
    db.doc(
      `agents/${normalizedAgentId}/config/magicTouchAI`
    );

  const [
    systemSnap,
    agentSnap,
  ] =
    await Promise.all([
      systemRef.get(),
      agentRef.get(),
    ]);

  const defaultSystem =
    getDefaultSystemSettings();

  const rawSystem =
    systemSnap.exists
      ? systemSnap.data() ||
        {}
      : {};

  const allowedModes =
    normalizeAllowedModes(
      rawSystem
        ?.allowedModes ||
      defaultSystem
        .allowedModes
    );

  const requestedDefaultMode =
    normalizeMode(
      rawSystem
        ?.defaultMode
    );

  const defaultMode =
    allowedModes.includes(
      requestedDefaultMode
    )
      ? requestedDefaultMode
      : "off";

  const system = {
    enabled:
      rawSystem
        ?.enabled ===
      true,

    allowedModes,

    defaultMode,

    updatedAt:
      rawSystem
        ?.updatedAt ||
      null,

    updatedBy:
      s(
        rawSystem
          ?.updatedBy
      ) ||
      null,
  };

  const defaultAgent =
    getDefaultAgentSettings(
      defaultMode
    );

  const rawAgent =
    agentSnap.exists
      ? agentSnap.data() ||
        {}
      : {};

  const requestedAgentMode =
    normalizeMode(
      rawAgent
        ?.mode ||
      defaultMode
    );

  /*
   * Agent לא יכול להשתמש ב-mode
   * שלא אושר ברמת המערכת.
   */
  const agentMode =
    allowedModes.includes(
      requestedAgentMode
    )
      ? requestedAgentMode
      : defaultMode;

  const rawProfile =
    rawAgent
      ?.conversationProfile ||
    {};

  const agent = {
    enabled:
      rawAgent
        ?.enabled ===
      true,

    mode:
      agentMode,

    minConfidence:
      normalizeConfidence(
        rawAgent
          ?.minConfidence ??
        defaultAgent
          .minConfidence
      ),

    conversationProfile: {
      tone:
        normalizeTone(
          rawProfile
            ?.tone ||
          defaultAgent
            .conversationProfile
            .tone
        ),

      useCustomerFirstName:
        rawProfile
          ?.useCustomerFirstName !==
        false,

      emojiLevel:
        normalizeEmojiLevel(
          rawProfile
            ?.emojiLevel ||
          defaultAgent
            .conversationProfile
            .emojiLevel
        ),

      customStyleInstructions:
        s(
          rawProfile
            ?.customStyleInstructions
        ),
    },

    updatedAt:
      rawAgent
        ?.updatedAt ||
      null,

    updatedBy:
      s(
        rawAgent
          ?.updatedBy
      ) ||
      null,
  };

  /*
   * AI פעיל רק כאשר:
   * 1. המערכת מאפשרת AI
   * 2. הסוכן מאפשר AI
   * 3. mode אינו off
   * 4. ה-mode של הסוכן מאושר ברמת המערכת
   */
  const effectiveEnabled =
    system.enabled &&
    agent.enabled &&
    agent.mode !==
      "off" &&
    system.allowedModes.includes(
      agent.mode
    );

  const effective:
    EffectiveMagicTouchAISettings = {
      enabled:
        effectiveEnabled,

      mode:
        effectiveEnabled
          ? agent.mode
          : "off",

      minConfidence:
        agent.minConfidence,

      conversationProfile:
        agent
          .conversationProfile,
    };

  return {
    system,
    agent,
    effective,
  };
}

/*
 * פונקציה לשימוש פנימי מהמנוע.
 * אין כאן auth כי היא לא endpoint ציבורי.
 */
export async function getEffectiveMagicTouchAISettings(
  agentId:
    string
): Promise<EffectiveMagicTouchAISettings> {
  const settings =
    await loadMagicTouchAISettings(
      agentId
    );

  return settings
    .effective;
}

/*
 * ---------------------------------------------------------
 * GET SETTINGS
 * ---------------------------------------------------------
 */

export async function getMagicTouchAISettingsImpl(
  request: any
) {
  const uid =
    requireAuth(
      request
    );

  const user =
    await getUserContext(
      uid
    );

  const requestedAgentId =
    s(
      request.data
        ?.agentId
    );

  const agentId =
    requestedAgentId ||
    user.agentId;

  if (
    !agentId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "agentId is required"
    );
  }

  /*
   * משתמש רגיל יכול לקרוא
   * רק את ההגדרות של הסוכן שלו.
   */
  if (
    !user.isSystem &&
    user.agentId !==
      agentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "You cannot access another agent"
    );
  }

  const settings =
    await loadMagicTouchAISettings(
      agentId
    );

  return {
    ok:
      true,

    agentId,

    canEditSystem:
      user.isSystem,

    system:
      settings.system,

    agent:
      settings.agent,

    effective:
      settings.effective,
  };
}

/*
 * ---------------------------------------------------------
 * SAVE SYSTEM SETTINGS
 * ---------------------------------------------------------
 */

export async function saveSystemMagicTouchAISettingsImpl(
  request: any
) {
  const uid =
    requireAuth(
      request
    );

  const user =
    await getUserContext(
      uid
    );

  if (
    !user.isSystem
  ) {
    throw new HttpsError(
      "permission-denied",
      "System permission is required"
    );
  }

  const enabled =
    request.data
      ?.enabled ===
    true;

  const allowedModes =
    normalizeAllowedModes(
      request.data
        ?.allowedModes
    );

  const requestedDefaultMode =
    normalizeMode(
      request.data
        ?.defaultMode
    );

  const defaultMode =
    allowedModes.includes(
      requestedDefaultMode
    )
      ? requestedDefaultMode
      : "off";

  const db =
    adminDb();

  await db
    .doc(
      "systemConfig/magicTouchAI"
    )
    .set(
      {
        enabled,

        allowedModes,

        defaultMode,

        updatedAt:
          nowTs(),

        updatedBy:
          uid,
      },
      {
        merge:
          true,
      }
    );

  return {
    ok:
      true,

    system: {
      enabled,

      allowedModes,

      defaultMode,
    },
  };
}

/*
 * ---------------------------------------------------------
 * SAVE AGENT SETTINGS
 * ---------------------------------------------------------
 */

export async function saveAgentMagicTouchAISettingsImpl(
  request: any
) {
  const uid =
    requireAuth(
      request
    );

  const user =
    await getUserContext(
      uid
    );

  const requestedAgentId =
    s(
      request.data
        ?.agentId
    );

  const agentId =
    requestedAgentId ||
    user.agentId;

  if (
    !agentId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "agentId is required"
    );
  }

  /*
   * משתמש רגיל יכול לעדכן
   * רק את הסוכן שלו.
   */
  if (
    !user.isSystem &&
    user.agentId !==
      agentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "You cannot update another agent"
    );
  }

  const db =
    adminDb();

  const systemSnap =
    await db
      .doc(
        "systemConfig/magicTouchAI"
      )
      .get();

  const rawSystem =
    systemSnap.exists
      ? systemSnap.data() ||
        {}
      : {};

  const allowedModes =
    normalizeAllowedModes(
      rawSystem
        ?.allowedModes
    );

  const requestedMode =
    normalizeMode(
      request.data
        ?.mode
    );

  /*
   * אי אפשר לפתוח Agent Mode
   * שהמערכת עדיין לא אישרה.
   */
  if (
    !allowedModes.includes(
      requestedMode
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      `AI mode is not enabled by the system: ${requestedMode}`
    );
  }

  const conversationProfile =
    request.data
      ?.conversationProfile ||
    {};

  const agentSettings = {
    enabled:
      request.data
        ?.enabled ===
      true,

    mode:
      requestedMode,

    minConfidence:
      normalizeConfidence(
        request.data
          ?.minConfidence
      ),

    conversationProfile: {
      tone:
        normalizeTone(
          conversationProfile
            ?.tone
        ),

      useCustomerFirstName:
        conversationProfile
          ?.useCustomerFirstName !==
        false,

      emojiLevel:
        normalizeEmojiLevel(
          conversationProfile
            ?.emojiLevel
        ),

      customStyleInstructions:
        s(
          conversationProfile
            ?.customStyleInstructions
        ),
    },

    updatedAt:
      nowTs(),

    updatedBy:
      uid,
  };

  await db
    .doc(
      `agents/${agentId}/config/magicTouchAI`
    )
    .set(
      agentSettings,
      {
        merge:
          true,
      }
    );

  return {
    ok:
      true,

    agentId,

    agent: {
      enabled:
        agentSettings.enabled,

      mode:
        agentSettings.mode,

      minConfidence:
        agentSettings
          .minConfidence,

      conversationProfile:
        agentSettings
          .conversationProfile,
    },
  };
}
