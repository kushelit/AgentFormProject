/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type MagicTouchFlowStatus =
  | "draft"
  | "active"
  | "paused"
  | "archived";

export type MagicTouchFlowRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export type MagicTouchEventStatus =
  | "pending"
  | "processing"
  | "dispatched"
  | "ignored"
  | "failed";

export type MagicTouchTriggerType =
  | "whatsapp_message_received"
  | "whatsapp_quick_reply_received"
  | "whatsapp_status_changed"
  | "contact_created"
  | "contact_updated"
  | "campaign_completed"
  | "appointment_booked"
  | "appointment_cancelled"
  | "scheduled"
  | string;

export type MagicTouchFlowTrigger = {
  type: MagicTouchTriggerType;

  templateName?: string | null;
  quickReplyAction?: string | null;
  sourceSystem?: string | null;
  campaignId?: string | null;

  conditions?: MagicTouchFlowCondition[];
};

export type MagicTouchFlowCondition = {
  field: string;

  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "exists"
    | "not_exists"
    | "in"
    | "not_in";

  value?: any;
};

export type MagicTouchFlowDefinition = {
  flowId: string;
  agentId: string;

  name: string;
  description?: string | null;

  status: MagicTouchFlowStatus;
  version: number;

  trigger: MagicTouchFlowTrigger;

  firstStepId: string;

  createdBy: string;
  updatedBy: string;

  createdAt?: any;
  updatedAt?: any;
};

export type MagicTouchFlowStepType =
  | "condition"
  | "update_contact"
  | "send_whatsapp_template"
  | "send_whatsapp_text"
  | "send_booking_link"
  | "send_crm_activity"
  | "create_task"
  | "add_tag"
  | "remove_tag"
  | "wait"
  | "end"
  | string;

export type MagicTouchFlowStepDefinition = {
  stepId: string;

  name?: string | null;

  type: MagicTouchFlowStepType;

  order?: number;

  config?: Record<string, any>;

  condition?: MagicTouchFlowCondition;

  nextStepId?: string | null;

  onTrueStepId?: string | null;
  onFalseStepId?: string | null;

  isEnabled?: boolean;
};

export type MagicTouchAutomationEvent = {
  eventId: string;
  agentId: string;

  contactId?: string | null;
  conversationId?: string | null;

  triggerType: MagicTouchTriggerType;

  channel?: string | null;

  messageType?: string | null;
  messageText?: string | null;

  waMessageId?: string | null;
  contextMessageId?: string | null;

  templateName?: string | null;
  quickReplyAction?: string | null;

  sourceSystem?: string | null;
  sourceRecordId?: string | null;

  campaignId?: string | null;

  status: MagicTouchEventStatus;

  attempts?: number;

  rawJson?: string | null;

  occurredAt?: any;
  createdAt?: any;
  updatedAt?: any;
};

export type MagicTouchFlowRun = {
  runId: string;

  agentId: string;
  flowId: string;
  flowVersion: number;

  eventId: string;

  contactId?: string | null;
  conversationId?: string | null;

  triggerType: MagicTouchTriggerType;

  status: MagicTouchFlowRunStatus;

  currentStepId: string | null;

  startedAt?: any;
  completedAt?: any;
  failedAt?: any;

  error?: string | null;

  createdAt?: any;
  updatedAt?: any;
};