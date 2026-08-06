import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/firebase";
import type { FlowTemplateSummary } from "./types";

export async function listFlowTemplates(): Promise<FlowTemplateSummary[]> {
  const fn = httpsCallable<Record<string, never>, { templates: FlowTemplateSummary[] }>(
    functions,
    "listMagicTouchFlowTemplates"
  );
  const result = await fn({});
  return Array.isArray(result.data?.templates) ? result.data.templates : [];
}

export async function saveFlowAsTemplate(input: {
  agentId: string;
  flowId: string;
  templateId?: string;
  templateKey: string;
  name: string;
  description: string;
  category: string;
  status: "draft" | "published";
}): Promise<{ templateId: string; version: number }> {
  const fn = httpsCallable<typeof input, { templateId: string; version: number }>(
    functions,
    "saveMagicTouchFlowAsTemplate"
  );
  const result = await fn(input);
  return result.data;
}

export function downloadFlowTemplate(template: FlowTemplateSummary): void {
  const exported = {
    schemaVersion: template.schemaVersion,
    template: {
      templateKey: template.templateKey,
      name: template.name,
      description: template.description,
      category: template.category,
      status: template.status,
      version: template.version,
      trigger: template.trigger,
      firstStepId: template.firstStepId,
      steps: template.steps,
      variables: template.variables,
      requiredIntegrations: template.requiredIntegrations,
      requiredPermissions: template.requiredPermissions,
    },
  };

  const blob = new Blob([JSON.stringify(exported, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${template.templateKey}-v${template.version}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
