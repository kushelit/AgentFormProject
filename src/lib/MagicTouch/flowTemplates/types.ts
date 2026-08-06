export type FlowTemplateTimestamp = {
  seconds: number;
  nanoseconds: number;
};

export type FlowTemplateSummary = {
  templateId: string;
  templateKey: string;
  name: string;
  description: string;
  category: string;
  status: "draft" | "published" | "archived";
  version: number;
  schemaVersion: number;
  sourceAgentId: string;
  sourceFlowId: string;
  sourceFlowVersion: number;
  trigger: Record<string, unknown>;
  firstStepId: string;
  steps: Record<string, unknown>;
  variables: unknown[];
  requiredIntegrations: string[];
  requiredPermissions: string[];
  createdAt?: FlowTemplateTimestamp | string | null;
  updatedAt?: FlowTemplateTimestamp | string | null;
};