import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

import type {
  GetAgentSurenseApiConfigResponse,
  SaveAgentSurenseApiCredentialsResponse,
} from "./types";

export async function getAgentSurenseApiConfig(
  agentId: string
): Promise<GetAgentSurenseApiConfigResponse> {
  const fn =
    httpsCallable<
      {
        agentId: string;
      },
      GetAgentSurenseApiConfigResponse
    >(
      functions,
      "getAgentSurenseApiConfig"
    );

  const response =
    await fn({
      agentId,
    });

  return response.data;
}

export async function saveAgentSurenseApiCredentials(
  input: {
    agentId: string;
    clientId: string;
    clientSecret: string;
    tokenEndpoint?: string;
  }
): Promise<SaveAgentSurenseApiCredentialsResponse> {
  const fn =
    httpsCallable<
      {
        agentId: string;
        clientId: string;
        clientSecret: string;
        tokenEndpoint?: string;
      },
      SaveAgentSurenseApiCredentialsResponse
    >(
      functions,
      "saveAgentSurenseApiCredentials"
    );

  const response =
    await fn({
      agentId:
        input.agentId,

      clientId:
        input.clientId,

      clientSecret:
        input.clientSecret,

      tokenEndpoint:
        input.tokenEndpoint,
    });

  return response.data;
}