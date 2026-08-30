import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

/*
 * =========================================================
 * Search Customers + Upsert Contact
 * =========================================================
 */

export type RunSurenseCustomerImportResult = {
  customerId?: string;

  contactId?: string;

  action?:
    | "created"
    | "updated";

  contactResult?: unknown;
};

export type RunSurenseCustomerImportResponse = {
  ok: boolean;

  executed: boolean;

  capability?:
    "searchCustomers";

  provider?:
    "make" |
    "api";

  reason?: string;

  searched?: number;

  imported?: number;

  results?:
    RunSurenseCustomerImportResult[];
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

/*
 * =========================================================
 * Create Surense Workflow
 * =========================================================
 */

export type RunSurenseCreateWorkflowResponse = {
  ok: boolean;

  executed: boolean;

  capability?:
    "createWorkflow";

  provider?:
    "make" |
    "api";

  reason?: string;

  customerId?: string;

  workflowId?: string;

  statusId?: string | null;

  statusName?: string | null;

  typeId?: string | null;

  typeName?: string | null;

  lastActivityDate?: string | null;
};

export async function runSurenseCreateWorkflow(
  input: {
    agentId: string;
    customerId: string;
  }
): Promise<RunSurenseCreateWorkflowResponse> {
  const fn =
    httpsCallable<
      {
        agentId: string;
        customerId: string;
      },
      RunSurenseCreateWorkflowResponse
    >(
      functions,
      "runSurenseCreateWorkflow"
    );

  const response =
    await fn({
      agentId:
        input.agentId,

      customerId:
        input.customerId,
    });

  return response.data;
}

/*
 * =========================================================
 * Workflow Types Test
 * =========================================================
 */

export type RunSurenseWorkflowTypesTestResponse = {
  ok: boolean;

  executed: boolean;

  capability?:
    "workflowTypesTest";

  provider?:
    "api";

  httpStatus?: number;

  response?: unknown;
};

export async function runSurenseWorkflowTypesTest(
  input: {
    agentId: string;
  }
): Promise<RunSurenseWorkflowTypesTestResponse> {
  const fn =
    httpsCallable<
      {
        agentId: string;
      },
      RunSurenseWorkflowTypesTestResponse
    >(
      functions,
      "runSurenseWorkflowTypesTest"
    );

  const response =
    await fn({
      agentId:
        input.agentId,
    });

  return response.data;
}
