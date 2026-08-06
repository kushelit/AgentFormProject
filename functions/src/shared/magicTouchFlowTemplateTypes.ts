/* eslint-disable @typescript-eslint/no-explicit-any */

export const MAGIC_TOUCH_FLOW_TEMPLATE_SCHEMA_VERSION = 1;

export type MagicTouchFlowTemplateStatus =
  | "draft"
  | "published"
  | "archived";

export type MagicTouchFlowTemplateVariable = {
  key: string;
  label: string;
  description?: string;
  type: "string" | "number" | "boolean" | "url" | "template_name";
  required: boolean;
  defaultValue?: any;
  source?: string;
  validation?: Record<string, any>;
};

export type MagicTouchFlowTemplateDocument = {
  schemaVersion: number;
  templateId: string;
  templateKey: string;
  name: string;
  description: string;
  category: string;
  status: MagicTouchFlowTemplateStatus;
  version: number;

  sourceAgentId: string;
  sourceFlowId: string;
  sourceFlowVersion: number;

  trigger: Record<string, any>;
  firstStepId: string;
  steps: Record<string, any>;

  variables: MagicTouchFlowTemplateVariable[];
  requiredIntegrations: string[];
  requiredPermissions: string[];

  createdBy: string;
  updatedBy: string;
  createdAt?: any;
  updatedAt?: any;
};
