import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

import type {
  GetSurenseSystemConfigResponse,
  SaveSurenseSystemConfigResponse,
  SurenseSystemIntegrationConfig,
} from "./types";

export async function getSurenseSystemConfig():
Promise<GetSurenseSystemConfigResponse> {
  const fn =
    httpsCallable<
      Record<string, never>,
      GetSurenseSystemConfigResponse
    >(
      functions,
      "getSurenseSystemConfig"
    );

  const response =
    await fn({});

  return response.data;
}

export async function saveSurenseSystemConfig(
  config: SurenseSystemIntegrationConfig
): Promise<SaveSurenseSystemConfigResponse> {
  const fn =
    httpsCallable<
      {
        config: SurenseSystemIntegrationConfig;
      },
      SaveSurenseSystemConfigResponse
    >(
      functions,
      "saveSurenseSystemConfig"
    );

  const response =
    await fn({
      config,
    });

  return response.data;
}