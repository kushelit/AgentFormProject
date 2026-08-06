/* eslint-disable require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */

const OMITTED_FLOW_FIELDS = new Set([
  "agentId",
  "flowId",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "activatedAt",
  "deactivatedAt",
  "deletedAt",
  "deletedBy",
  "runId",
  "eventId",
]);

function cleanValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(cleanValue);
  }

  if (value && typeof value === "object") {
    const result: Record<string, any> = {};

    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined || OMITTED_FLOW_FIELDS.has(key)) {
        continue;
      }

      result[key] = cleanValue(nested);
    }

    return result;
  }

  return value;
}

function detectRequiredIntegrations(
  trigger: Record<string, any>,
  steps: Record<string, any>
): string[] {
  const integrations = new Set<string>();
  const triggerType = String(trigger?.type || "").toLowerCase();

  if (triggerType.includes("microsoft_booking") || triggerType.includes("appointment")) {
    integrations.add("microsoftBookings");
  }

  for (const step of Object.values(steps)) {
    const type = String((step as any)?.type || "").toLowerCase();

    if (type.includes("whatsapp")) {
      integrations.add("whatsapp");
    }

    if (type.includes("surense")) {
      integrations.add("surense");
    }

    if (type.includes("booking")) {
      integrations.add("microsoftBookings");
    }
  }

  return Array.from(integrations).sort();
}

export function sanitizeFlowForTemplate(rawFlow: any) {
  const trigger = cleanValue(rawFlow?.trigger || {});
  const steps = cleanValue(rawFlow?.steps || {});

  return {
    trigger,
    firstStepId: String(rawFlow?.firstStepId || "").trim(),
    steps,
    requiredIntegrations: detectRequiredIntegrations(trigger, steps),
  };
}
