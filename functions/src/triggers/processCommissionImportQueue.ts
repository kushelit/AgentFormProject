/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {FUNCTIONS_REGION} from "../shared/region";

export const processCommissionImportQueue = onDocumentWritten(
  {
    document: "commissionImportQueue/{jobId}",
    region: FUNCTIONS_REGION,
    memory: "1GiB",
    timeoutSeconds: 540,
  },
  async (event) => {
    const mod = await import("./processCommissionImportQueue.impl");
    return mod.processCommissionImportQueueImpl(event);
  }
);
