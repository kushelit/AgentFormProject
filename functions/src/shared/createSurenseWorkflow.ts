/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  executeSurenseDirectRequest,
} from "./surenseDirectClient";

import {
  loadSurenseWorkflowDefaults,
} from "./surenseWorkflowConfig";

export type CreateSurenseWorkflowInput = {
  agentId: string;

  /*
   * משתנה בכל לקוח.
   * מגיע מה-Search Customers.
   */
  customerId: string;

  /*
   * Override אופציונלי.
   * ברוב המקרים נשתמש בהגדרות הסוכן.
   */
  typeId?: string;
  ownerId?: string;
  assignedUserId?: string;

   // מיועד לבדיקת הרשאות:
  // מאפשר לשלוח Create Workflow ללא assignedUserId
  omitAssignedUserId?: boolean;

  dueAt?: string;
  dueAtTimeSet?: boolean;
};

export type CreateSurenseWorkflowResult = {
  ok: true;
  httpStatus: number;

  workflowId: string;

  statusId: string | null;
  statusName: string | null;

  typeId: string | null;
  typeName: string | null;

  lastActivityDate: string | null;

  response: unknown;
};

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function firstString(
  ...values: unknown[]
): string {
  for (
    const value of values
  ) {
    const normalized =
      s(
        value
      );

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

export async function createSurenseWorkflow(
  input: CreateSurenseWorkflowInput
): Promise<CreateSurenseWorkflowResult> {
  const agentId =
    s(
      input.agentId
    );

  const customerId =
    s(
      input.customerId
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (!customerId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing Surense customerId"
    );
  }

  const defaults =
    await loadSurenseWorkflowDefaults(
      agentId
    );

  const typeId =
    s(
      input.typeId
    ) ||
    defaults.typeId;

  const ownerId =
    s(
      input.ownerId
    ) ||
    defaults.ownerId;

  const assignedUserId =
    s(
      input.assignedUserId
    ) ||
    defaults.assignedUserId;

  /*
   * זה משחזר את ה-Input של מודול Make
   * ששלחת:
   *
   * typeId
   * ownerId
   * customerId
   * assignedUserId
   */
const body:
  Record<string, unknown> = {
    typeId,
    ownerId,
    customerId,
  };

if (
  input.omitAssignedUserId !== true &&
  assignedUserId
) {
  body.assignedUserId =
    assignedUserId;
}

  const dueAt =
    s(
      input.dueAt
    );

  if (dueAt) {
    body.dueAt =
      dueAt;

    body.dueAtTimeSet =
      input.dueAtTimeSet ===
      true;
  }

  const result =
    await executeSurenseDirectRequest<any>({
      agentId,

      path:
        "/workflows",

      method:
        "POST",

      scopes: [
        "workflows:create",
      ],

      body,
    });

  const response =
    (
      result.response ||
      {}
    ) as any;

  /*
   * Make מציג את השדה בשם ID,
   * אבל אנחנו מאפשרים גם id
   * למקרה שה-Direct API מחזיר camelCase.
   */
  const workflowId =
    firstString(
      response?.id,
      response?.ID
    );

  if (!workflowId) {
    console.error(
      "[createSurenseWorkflow] Surense response did not include workflow ID",
      {
        agentId,
        customerId,
        response,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      "Surense create workflow response did not include workflow ID"
    );
  }

  const statusId =
    firstString(
      response?.statusId,
      response?.StatusID,
      response?.["Status ID"]
    ) ||
    null;

  const statusName =
    firstString(
      response?.statusName,
      response?.StatusName,
      response?.["Status Name"]
    ) ||
    null;

  const responseTypeId =
    firstString(
      response?.typeId,
      response?.TypeID,
      response?.["Type ID"]
    ) ||
    typeId ||
    null;

  const typeName =
    firstString(
      response?.typeName,
      response?.TypeName,
      response?.["Type Name"]
    ) ||
    null;

  const lastActivityDate =
    firstString(
      response?.lastActivityDate,
      response?.LastActivityDate,
      response?.["Last Activity Date"]
    ) ||
    null;

  console.info(
    "[createSurenseWorkflow] Workflow created",
    {
      agentId,
      customerId,
      workflowId,
      statusId,
      statusName,
    }
  );

  return {
    ok: true,

    httpStatus:
      result.httpStatus,

    workflowId,

    statusId,
    statusName,

    typeId:
      responseTypeId,

    typeName,

    lastActivityDate,

    response:
      result.response,
  };
}