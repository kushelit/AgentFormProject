import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

type MakeOutgoingActions = {
  updateWorkflow: boolean;
  closeWorkflow: boolean;
  getCustomer: boolean;
  createPowerOfAttorney: boolean;
};

export type SurenseRuntimeRequirements = {
  directApiRequired: boolean;
  incomingMakeRequired: boolean;
  makeOutgoingActions: MakeOutgoingActions;
};

type GetSurenseRuntimeConfigResponse = {
  ok: boolean;

  requirements: SurenseRuntimeRequirements;
};

export async function getSurenseRuntimeConfig():
Promise<GetSurenseRuntimeConfigResponse> {
  const fn =
    httpsCallable<
      Record<string, never>,
      GetSurenseRuntimeConfigResponse
    >(
      functions,
      "getSurenseRuntimeConfig"
    );

  const response =
    await fn({});

  return response.data;
}