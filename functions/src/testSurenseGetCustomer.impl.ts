/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { executeSurenseAction } from "./shared/surenseIntegrationService";

const TEST_PROJECT_ID = "magicsale-test";
const TEST_AGENT_ID = "5Ifm4d4Z5KMsXSnfaW37HcjPjj32";
const UNSIGNED_CUSTOMER_ID = "e89f3db7-02f4-400e-a58c-2c0ba8e0d32a";
const SIGNED_CUSTOMER_ID =
  "73df361a-8e73-4c94-9fc8-02bc419d521f";
  
function s(value: unknown): string {
  return String(value ?? "").trim();
}

export async function testSurenseGetCustomerImpl(input: {
  uid: string | null;
  agentId: unknown;
  surenseCustomerId: unknown;
  testCase: unknown;
}): Promise<Record<string, unknown>> {
  const projectId =
    s(process.env.GCLOUD_PROJECT) ||
    s(process.env.GOOGLE_CLOUD_PROJECT);

  if (projectId !== TEST_PROJECT_ID) {
    throw new HttpsError(
      "failed-precondition",
      `This test tool is allowed only in ${TEST_PROJECT_ID}`
    );
  }

  if (!input.uid) {
    throw new HttpsError(
      "unauthenticated",
      "A signed-in user is required"
    );
  }

  const agentId = s(input.agentId);

  if (agentId !== TEST_AGENT_ID) {
    throw new HttpsError(
      "permission-denied",
      "This test tool is restricted to the configured test agent"
    );
  }

  const testCase = s(input.testCase);
  let surenseCustomerId = s(input.surenseCustomerId);

  if (testCase === "unsigned") {
    surenseCustomerId = UNSIGNED_CUSTOMER_ID;
  }

  if (testCase === "signed") {
    surenseCustomerId = SIGNED_CUSTOMER_ID;
  }

  if (!surenseCustomerId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing Surense customer ID"
    );
  }

  const requestId = [
    "manual_get_customer_test",
    testCase || "custom",
    Date.now(),
  ].join(":");

  const result = await executeSurenseAction({
    agentId,
    action: "getCustomer",
    payload: {
      requestId,
      surenseCustomerId,
    },
  });

  return {
    ok: true,
    projectId,
    agentId,
    testCase: testCase || "custom",
    requestId,
    surenseCustomerId,
    httpStatus: result.httpStatus,
    response: result.response,
  };
}
