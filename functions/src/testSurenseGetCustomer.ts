/* eslint-disable max-len */

import { onCall } from "firebase-functions/v2/https";
import { SURENSE_ACTIVITY_API_KEY } from "./shared/secrets";
import { testSurenseGetCustomerImpl } from "./testSurenseGetCustomer.impl";

const REGION = process.env.FUNCTIONS_REGION || "europe-west1";

export const testSurenseGetCustomer = onCall(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [SURENSE_ACTIVITY_API_KEY],
  },
  async (request) => {
    return testSurenseGetCustomerImpl({
      uid: request.auth?.uid || null,
      agentId: request.data?.agentId,
      surenseCustomerId: request.data?.surenseCustomerId,
      testCase: request.data?.testCase,
    });
  }
);
