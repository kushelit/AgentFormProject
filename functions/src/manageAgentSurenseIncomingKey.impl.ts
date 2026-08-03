/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  adminDb,
} from "./shared/admin";

import {
  generateSurenseIncomingKey,
  hashSurenseIncomingKey,
} from "./shared/surenseIncomingKey";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function getProjectId(): string {
  return (
    s(
      process.env.GCLOUD_PROJECT
    ) ||
    s(
      process.env.GCP_PROJECT
    ) ||
    s(
      process.env.GOOGLE_CLOUD_PROJECT
    )
  );
}

function getIncomingWebhookUrl(): string {
  const projectId =
    getProjectId();

  if (!projectId) {
    return "";
  }

  return [
    "https://",
    FUNCTIONS_REGION,
    "-",
    projectId,
    ".cloudfunctions.net/",
    "magicTouchContactsWebhook",
  ].join("");
}

export async function getAgentSurenseIncomingConfigImpl(
  input: {
    agentId:
      string;
  }
): Promise<object> {
  const agentId =
    s(
      input?.agentId
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const db =
    adminDb();

  const secretSnap =
    await (
      db as any
    )
      .doc(
        `agents/${agentId}/secrets/surenseWebhook`
      )
      .get();

  const secretData =
    secretSnap.exists
      ? secretSnap.data()
      : {};

  const legacySnap =
    await (
      db as any
    )
      .doc(
        "systemConfig/reengagementWebhook"
      )
      .get();

  const legacyKey =
    s(
      legacySnap.exists
        ? legacySnap
          .data()
          ?.agents
          ?.[agentId]
        : ""
    );

  const hasAgentKey =
    Boolean(
      s(
        secretData
          ?.apiKeyHash
      )
    );

  return {
    ok:
      true,

    agentId,

    incoming: {
      webhookUrl:
        getIncomingWebhookUrl(),

      apiKeyConfigured:
        hasAgentKey ||
        Boolean(
          legacyKey
        ),

      storageMode:
        hasAgentKey
          ? "agent_secret"
          : legacyKey
            ? "legacy_system_config"
            : "not_configured",

      lastRotatedAt:
        secretData
          ?.rotatedAt ||
        null,
    },
  };
}

export async function rotateAgentSurenseIncomingKeyImpl(
  input: {
    agentId:
      string;

    rotatedBy?:
      string | null;
  }
): Promise<object> {
  const agentId =
    s(
      input?.agentId
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const db =
    adminDb();

  const agentSnap =
    await (
      db as any
    )
      .doc(
        `users/${agentId}`
      )
      .get();

  if (
    !agentSnap.exists
  ) {
    throw new HttpsError(
      "not-found",
      "Agent not found"
    );
  }

  const apiKey =
    generateSurenseIncomingKey();

  const apiKeyHash =
    hashSurenseIncomingKey(
      apiKey
    );

  const timestamp =
    FieldValue
      .serverTimestamp();

  await (
    db as any
  )
    .doc(
      `agents/${agentId}/secrets/surenseWebhook`
    )
    .set(
      {
        apiKeyHash,

        keyVersion:
          1,

        rotatedAt:
          timestamp,

        updatedAt:
          timestamp,

        updatedBy:
          s(
            input?.rotatedBy
          ) ||
          null,
      },

      {
        merge:
          true,
      }
    );

  await (
    db as any
  )
    .doc(
      `agents/${agentId}/config/main`
    )
    .set(
      {
        integrations: {
          surense: {
            incoming: {
              enabled:
                true,

              apiKeyConfigured:
                true,

              updatedAt:
                timestamp,

              updatedBy:
                s(
                  input?.rotatedBy
                ) ||
                null,
            },
          },
        },
      },

      {
        merge:
          true,
      }
    );

  return {
    ok:
      true,

    agentId,

    /*
     * המפתח מוחזר פעם אחת בלבד.
     * במסד נשמר רק Hash.
     */
    apiKey,

    webhookUrl:
      getIncomingWebhookUrl(),
  };
}
