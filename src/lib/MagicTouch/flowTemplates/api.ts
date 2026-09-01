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
export async function installFlowTemplateForAgent(input: {
  templateId: string;
  agentId: string;
  name: string;
  whatsappTemplateName?: string;
}): Promise<{
  flowId: string;
  flowName: string;
  stepCount: number;
}> {
  const fn =
    httpsCallable<
      typeof input,
      {
        flowId: string;
        flowName: string;
        stepCount: number;
      }
    >(
      functions,
      "installMagicTouchFlowTemplateForAgent"
    );

  const result =
    await fn(input);

  return result.data;
}

export async function importFlowTemplateJson(input: {
  payload: Record<string, unknown>;
  replaceExisting?: boolean;
}): Promise<{
  templateId: string;
  templateKey: string;
  version: number;
  replaced: boolean;
  stepCount: number;
}> {
  const fn =
    httpsCallable<
      typeof input,
      {
        templateId: string;
        templateKey: string;
        version: number;
        replaced: boolean;
        stepCount: number;
      }
    >(
      functions,
      "importMagicTouchFlowTemplate"
    );

  const result =
    await fn(input);

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

export async function deleteFlowTemplate(
  templateId: string
): Promise<{
  templateId: string;
}> {
  const fn =
    httpsCallable<
      {
        templateId: string;
      },
      {
        ok: boolean;
        templateId: string;
      }
    >(
      functions,
      "deleteMagicTouchFlowTemplate"
    );

  const result =
    await fn({
      templateId,
    });

  return {
    templateId:
      result.data.templateId,
  };
}

export async function updateFlowTemplate(input: {
  templateId: string;

  name: string;

  description: string;

  status:
    | "draft"
    | "published";

  trigger:
    Record<
      string,
      unknown
    >;

  firstStepId:
    string;

  steps:
    Record<
      string,
      unknown
    >;

  variables?:
    unknown[];
}): Promise<{
  templateId: string;
  version: number;
  status:
    | "draft"
    | "published";
}> {
  const fn =
    httpsCallable<
      typeof input,
      {
        ok: boolean;
        templateId: string;
        version: number;
        status:
          | "draft"
          | "published";
      }
    >(
      functions,
      "updateMagicTouchFlowTemplate"
    );

  const result =
    await fn(input);

  return {
    templateId:
      result.data.templateId,

    version:
      result.data.version,

    status:
      result.data.status,
  };
}