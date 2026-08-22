"use client";

import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

export type EnsureMagicTouchOnboardingInboundFlowResponse = {
  ok:
    boolean;

  created:
    boolean;

  updated:
    boolean;

  unchanged:
    boolean;

  agentId:
    string;

  flowId:
    string;

  flowName:
    string;

  version:
    number;

  status:
    string;
};

export async function ensureMagicTouchOnboardingInboundFlow(
  agentId:
    string
): Promise<EnsureMagicTouchOnboardingInboundFlowResponse> {
  const fn =
    httpsCallable<
      {
        agentId:
          string;
      },
      EnsureMagicTouchOnboardingInboundFlowResponse
    >(
      functions,
      "ensureMagicTouchOnboardingInboundFlow"
    );

  const result =
    await fn({
      agentId,
    });

  return result.data;
}
