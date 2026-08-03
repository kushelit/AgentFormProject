import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/firebase";

import type {
  GetMagicTouchFlowRunDetailsRequest,
  GetMagicTouchFlowRunDetailsResponse,
  GetMagicTouchFlowRunsRequest,
  GetMagicTouchFlowRunsResponse,
} from "./types";

export async function getMagicTouchFlowRuns(
  request: GetMagicTouchFlowRunsRequest
): Promise<GetMagicTouchFlowRunsResponse> {
  const fn = httpsCallable<
    GetMagicTouchFlowRunsRequest,
    GetMagicTouchFlowRunsResponse
  >(
    functions,
    "getMagicTouchFlowRuns"
  );

  const response = await fn(request);
  return response.data;
}

export async function getMagicTouchFlowRunDetails(
  request: GetMagicTouchFlowRunDetailsRequest
): Promise<GetMagicTouchFlowRunDetailsResponse> {
  const fn = httpsCallable<
    GetMagicTouchFlowRunDetailsRequest,
    GetMagicTouchFlowRunDetailsResponse
  >(
    functions,
    "getMagicTouchFlowRunDetails"
  );

  const response = await fn(request);
  return response.data;
}
