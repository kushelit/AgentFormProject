/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {FUNCTIONS_REGION} from "../shared/region";

export const enqueueCommissionImportFromPortalRun = onDocumentWritten(
  {
    document: "portalImportRuns/{runId}",
    region: FUNCTIONS_REGION,
  },
  async (event) => {
    const mod = await import("./enqueuePortalRun.impl");
    return mod.enqueueCommissionImportFromPortalRunImpl(event);
  }
);
