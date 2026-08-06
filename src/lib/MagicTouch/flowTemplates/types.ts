/* eslint-disable @typescript-eslint/no-explicit-any */

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
  trigger: Record<string, any>;
  firstStepId: string;
  steps: Record<string, any>;
  variables: any[];
  requiredIntegrations: string[];
  requiredPermissions: string[];
  createdAt?: any;
  updatedAt?: any;
};
