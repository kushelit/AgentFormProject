/* eslint-disable @typescript-eslint/no-explicit-any */

export type MagicTouchFlowStatus =
  | "draft"
  | "active"
  | "inactive"
  | "archived";

export type MagicTouchStepType =
  | "condition"
  | "send_whatsapp"
  | "send_booking_link"
  | "send_google_booking_link"
  | "update_contact"
  | "add_timeline_event"
  | "sync_surense_activity"
  | "create_surense_power_of_attorney"
  | "http_request"
  | "delay"
  | "request_documents"
  | "wait_for_customer_response"
  | "create_task"
  | "end";

export interface MagicTouchFlowBranch {
  id: string;
  value: string;
  label?: string;
  nextStepId: string | null;
}

export interface MagicTouchFlowStep {
  id: string;
  type: MagicTouchStepType;
  name?: string;
  nextStepId?: string | null;
  config?: Record<string, any>;
}

export interface MagicTouchFlowDocument {
  flowId: string;
  agentId: string;
  name: string;
  description?: string;
  status: MagicTouchFlowStatus;
  version: number;
  firstStepId: string;
  trigger: any;
  steps: Record<string, MagicTouchFlowStep>;
}

export interface MagicTouchFlowValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface MagicTouchFlowValidationResult {
  valid: boolean;
  issues: MagicTouchFlowValidationIssue[];
}
