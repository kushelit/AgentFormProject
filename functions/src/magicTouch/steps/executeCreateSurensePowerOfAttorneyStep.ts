/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "../../shared/admin";
import type { MagicTouchExecutionContext, MagicTouchFlowStep } from "../../shared/magicTouchDispatcherTypes";
import type { ExecuteStepResult } from "../executeMagicTouchFlowStep";
import { executeSurenseAction } from "../../shared/surenseIntegrationService";

import {
  addMagicTouchTimelineEvent,
} from "../../shared/magicTouchTimelineService";

const s = (v: any): string => String(v ?? "").trim();
const asRecord = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const first = (...values: unknown[]): string => values.map(s).find(Boolean) || "";

function setNestedValue(target: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

export async function executeCreateSurensePowerOfAttorneyStep({ context, step }: {
  context: MagicTouchExecutionContext;
  step: MagicTouchFlowStep;
}): Promise<ExecuteStepResult> {
  const contactId = s(context.run.contactId || context.event?.contactId);
  if (!contactId) throw new HttpsError("failed-precondition", "Flow run has no contactId");

  const db = adminDb();
  const contactRef = (db as any).doc(`agents/${context.agentId}/magic_touch_contacts/${contactId}`);
  const contactSnap = await contactRef.get();
  if (!contactSnap.exists) throw new HttpsError("not-found", "MagicTouch contact not found");

  const contact = contactSnap.data() as Record<string, any>;
  if (s(contact?.sourceSystem) !== "surense") throw new HttpsError("failed-precondition", "Contact is not linked to Surense");

  const surenseCustomerId = first(contact?.sourceRecordId, contact?.sourceData?.customerId, contact?.sourceData?.surense?.customerId);
  if (!surenseCustomerId) throw new HttpsError("failed-precondition", "Contact is missing Surense customer ID");

  const requestId = [s(context.run.runId), s(step.id)].filter(Boolean).join(":");
  const includeHb = step.config?.includeHb !== false;
  const includePolicies = step.config?.includePolicies !== false;
  const includeSwiftness = step.config?.includeSwiftness !== false;

  const result = await executeSurenseAction({
    agentId: context.agentId,
    action: "createPowerOfAttorney",
    payload: {
      requestId,
      contactId,
      surenseCustomerId,
      fullName: s(contact?.fullName),
      email: s(contact?.email) || null,
      phone: s(contact?.phone) || null,
      includeHb,
      includePolicies,
      includeSwiftness,
    },
  });

  const response = asRecord(result.response);
  const url = first(response.url, response.Url, response.proxyUrl, response.signingUrl, response.result?.url, response.result?.Url);
  const message = first(response.message, response.Message, response.result?.message, response.result?.Message);
  if (!url) throw new HttpsError("failed-precondition", "Surense power-of-attorney response did not include a URL");

  const requestedAt = Timestamp.now();
  const statusPath = s(step.config?.statusPath) || "engagement.reengagement.powerOfAttorney";
  const value = {
    status: "waiting_for_signature",
    signingUrl: url,
    message: message || null,
    requestedAt,
    lastCheckedAt: null,
    source: "surense",
    requestId,
    included: { hb: includeHb, policies: includePolicies, swiftness: includeSwiftness },
  };

  await contactRef.update({ [statusPath]: value, updatedAt: requestedAt });
  if (!context.contact) context.contact = contact;
  setNestedValue(context.contact as Record<string, any>, statusPath, value);

  try {
  await addMagicTouchTimelineEvent({
    agentId:
      context.agentId,

    contactId,

    type:
      "surense_power_of_attorney_created",

    channel:
      "surense",

    title:
      "נוצר קישור ייפוי כוח",

    description:
      "נוצר קישור ייפוי כוח ב־Surense וממתין לחתימת הלקוח.",

    direction:
      "outbound",

    status:
      "completed",

    createdBy:
      "magic_touch_automation",

    sourceSystem:
      "surense",

    sourceRecordId:
      requestId,

    metadata: {
      flowRunId:
        context.run.runId,

      flowId:
        context.flow.flowId,

      eventId:
        context.run.eventId,

      stepId:
        step.id,

      surenseCustomerId,

      requestId,

      status:
        "waiting_for_signature",

      included: {
        hb:
          includeHb,

        policies:
          includePolicies,

        swiftness:
          includeSwiftness,
      },
    },
  });
} catch (timelineError: any) {
  console.error(
    "[executeCreateSurensePowerOfAttorneyStep] Timeline event failed",
    {
      agentId:
        context.agentId,

      contactId,

      requestId,

      error:
        timelineError?.message ||
        String(timelineError),
    }
  );
}

  return {
    status: step.nextStepId ? "continue" : "completed",
    nextStepId: step.nextStepId || null,
    output: { created: true, contactId, surenseCustomerId, requestId, url, message: message || null, requestedAt, status: "waiting_for_signature", httpStatus: result.httpStatus },
  };
}
