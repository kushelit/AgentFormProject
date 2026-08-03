import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

export type SurenseIncomingConfig = {
  webhookUrl: string;
  apiKeyConfigured: boolean;
  storageMode:
    | "agent_secret"
    | "legacy_system_config"
    | "not_configured";
  lastRotatedAt?: unknown;
};

export async function getAgentSurenseIncomingConfig(
  agentId: string
): Promise<{
  ok: boolean;
  agentId: string;
  incoming: SurenseIncomingConfig;
}> {
  const fn =
    httpsCallable<
      {
        agentId:
          string;
      },
      {
        ok:
          boolean;

        agentId:
          string;

        incoming:
          SurenseIncomingConfig;
      }
    >(
      functions,
      "getAgentSurenseIncomingConfig"
    );

  const response =
    await fn({
      agentId,
    });

  return response.data;
}

export async function rotateAgentSurenseIncomingKey(
  agentId: string
): Promise<{
  ok: boolean;
  agentId: string;
  apiKey: string;
  webhookUrl: string;
}> {
  const fn =
    httpsCallable<
      {
        agentId:
          string;
      },
      {
        ok:
          boolean;

        agentId:
          string;

        apiKey:
          string;

        webhookUrl:
          string;
      }
    >(
      functions,
      "rotateAgentSurenseIncomingKey"
    );

  const response =
    await fn({
      agentId,
    });

  return response.data;
}
