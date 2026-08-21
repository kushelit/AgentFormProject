/* eslint-disable @typescript-eslint/no-explicit-any */

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

export type MagicTouchWaitingForType =
  | "customer_response"
  | "document"
  | "booking"
  | "signature"
  | "external_event"
  | "delay";


  export interface MagicTouchResponseOption {
  action:
    string;

  label?:
    string;

  description?:
    string;
}

export interface MagicTouchWaitingPromptContext {
  question?:
    string |
    null;
}

export interface MagicTouchWaitingFor {
  type:
    MagicTouchWaitingForType;

  stepId?:
    string |
    null;

  resumeStepId?:
    string |
    null;

  expectedActions?:
    string[];

  responseOptions?:
    MagicTouchResponseOption[];

  promptContext?:
    MagicTouchWaitingPromptContext |
    null;

  startedAt?:
    any;

  context?:
    Record<
      string,
      any
    > |
    null;

    resolution?: {
  mode?:
    | "quick_reply_only"
    | "ai"
    | "ai_with_human_fallback";

  minConfidence?:
    number;
} | null;
}

export interface MagicTouchFlowStep {
  id:
    string;

  type:
    MagicTouchStepType;

  name?:
    string;

  nextStepId?:
    string |
    null;

  config?:
    Record<
      string,
      any
    >;
}

export interface MagicTouchFlowDefinitionV2 {
  flowId:
    string;

  agentId:
    string;

  name:
    string;

  description?:
    string;

  status:
    | "draft"
    | "active"
    | "inactive"
    | "archived";

  version:
    number;

  firstStepId:
    string;

  trigger:
    Record<
      string,
      any
    >;

  steps:
    Record<
      string,
      MagicTouchFlowStep
    >;
}

export interface MagicTouchFlowRun {
  runId:
    string;

  agentId:
    string;

  flowId:
    string;

  flowName?:
    string |
    null;

  flowVersion:
    number;

  eventId:
    string;

  contactId?:
    string |
    null;

  conversationId?:
    string |
    null;

  triggerType:
    string;

  status:
    string;

  currentStepId:
    string;

  attempts?:
    number;

  waitingFor?:
    MagicTouchWaitingFor |
    null;

    executionEventId?:
  string |
  null;

  [key: string]:
    any;
}

export interface MagicTouchAgentBookingContext {
  defaultServiceUrl:
    string |
    null;
}

export interface MagicTouchAgentContext {
  booking:
    MagicTouchAgentBookingContext;
}

export interface MagicTouchExecutionContext {
  agentId:
    string;

  run:
    MagicTouchFlowRun;

  flow:
    MagicTouchFlowDefinitionV2;

  event:
    Record<
      string,
      any
    >;

  contact?:
    Record<
      string,
      any
    >;

  agent?:
    MagicTouchAgentContext;
}