import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

export type RunSurenseCustomerImportResponse = {
  ok: boolean;
  executed: boolean;

  provider?: "make" | "api";

  reason?: string;

  cutoff?: string;

  searched?: number;
  imported?: number;

  providers?: {
    searchCustomers: "make" | "api";
    createWorkflow: "make" | "api";
  };

  results?: Array<{
    customerId?: string;
    workflowId?: string;
    contactResult?: unknown;
  }>;
};

export async function runSurenseCustomerImport(
  input: {
    agentId: string;
    startRow?: number;
    endRow?: number;
  }
): Promise<RunSurenseCustomerImportResponse> {
  const fn =
    httpsCallable<
      {
        agentId: string;
        startRow?: number;
        endRow?: number;
      },
      RunSurenseCustomerImportResponse
    >(
      functions,
      "runSurenseCustomerImport"
    );

  const response =
    await fn({
      agentId:
        input.agentId,

      startRow:
        input.startRow,

      endRow:
        input.endRow,
    });

  return response.data;
}