/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  loadSurenseIntegrationConfig,
} from "./surenseIntegrationConfig";

export type SurenseWorkflowDefaults = {
  typeId: string;
  ownerId: string;
  assignedUserId: string;
};

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function loadSurenseWorkflowDefaults(
  agentIdInput: string
): Promise<SurenseWorkflowDefaults> {
  const agentId =
    s(
      agentIdInput
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  /*
   * משתמשים ב-loader המרכזי שכבר בנינו,
   * ולא קוראים שוב ישירות מ-Firestore.
   */
  const config =
    await loadSurenseIntegrationConfig(
      agentId
    );

  const typeId =
    s(
      config
        .workflowDefaults
        ?.typeId
    );

  const ownerId =
    s(
      config
        .workflowDefaults
        ?.ownerId
    );

  const assignedUserId =
    s(
      config
        .workflowDefaults
        ?.assignedUserId
    );

  if (!typeId) {
    throw new HttpsError(
      "failed-precondition",
      "Missing Surense workflowDefaults.typeId"
    );
  }

  if (!ownerId) {
    throw new HttpsError(
      "failed-precondition",
      "Missing Surense workflowDefaults.ownerId"
    );
  }

  return {
    typeId,

    ownerId,

    /*
     * אם בעתיד סוכן לא יגדיר Assigned User,
     * ברירת המחדל תהיה Owner.
     */
    assignedUserId:
      assignedUserId ||
      ownerId,
  };
}