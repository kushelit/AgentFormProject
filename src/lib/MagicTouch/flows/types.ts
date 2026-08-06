export type FlowStatus =
  | "draft"
  | "active"
  | "inactive"
  | "archived";

export type StepType =
  | "condition"
  | "send_whatsapp"
  | "request_documents"
  | "update_contact"
  | "add_timeline_event"
  | "sync_surense_activity"
  | "create_surense_power_of_attorney"
  | "http_request"
  | "delay"
  | "create_task"
  | "end";

export type FlowTrigger = {
  type: string;
  templateName?: string;
  quickReplyAction?: string;
  sourceSystem?: string;
  campaignId?: string;
  conditions: any[];
};

export type FlowStep = {
  id: string;
  type: StepType;
  name: string;
  nextStepId?: string | null;
  config: Record<string, unknown>;
};

export type FlowDocument = {
  flowId?: string;
  agentId?: string;
  name: string;
  description: string;
  status: FlowStatus;
  version?: number;
  firstStepId: string;
  trigger: FlowTrigger;
  steps: Record<string, FlowStep>;
  updatedAt?: unknown;
};

export type ValidationIssue = {
  code: string;
  path: string;
  message: string;
  severity: "error" | "warning";
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export const createEmptyFlow = (): FlowDocument => ({
  name: "",
  description: "",
  status: "draft",
  firstStepId: "",
  trigger: {
    type: "whatsapp_quick_reply_received",
    templateName: "",
    quickReplyAction: "",
    sourceSystem: "",
    campaignId: "",
    conditions: [],
  },
  steps: {},
});
