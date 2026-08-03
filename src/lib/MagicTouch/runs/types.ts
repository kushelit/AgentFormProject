export type FlowRunStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "dispatched"
  | string;

export type FlowRunStepHistoryItem = {
  stepId: string;
  stepName: string;
  stepType: string;
  status: string;
  startedAt: number | null;
  completedAt: number | null;
  output?: Record<string, unknown> | null;
  error?: unknown;
};

export type MagicTouchFlowRun = {
  id: string;
  runId: string;
  agentId: string;

  flowId: string;
  flowName: string;
  flowVersion: number | null;

  contactId: string | null;
  contactName?: string | null;
  contactPhone?: string | null;

  eventId: string | null;
  triggerType: string;

  status: FlowRunStatus;

  currentStepId: string | null;
  currentStepName?: string | null;

  lastStepId: string | null;
  lastStepName?: string | null;

  attempts: number;

  error: unknown | null;

  createdAt: number | null;
  processingStartedAt: number | null;
  completedAt: number | null;
  updatedAt: number | null;

  stepHistory: FlowRunStepHistoryItem[];
};

export type GetMagicTouchFlowRunsRequest = {
  agentId: string;
  status?: string;
  flowId?: string;
  triggerType?: string;
  contactSearch?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type GetMagicTouchFlowRunsResponse = {
  ok: boolean;
  agentId: string;
  runs: MagicTouchFlowRun[];
  count: number;
};

export type GetMagicTouchFlowRunDetailsRequest = {
  agentId: string;
  runId: string;
};

export type GetMagicTouchFlowRunDetailsResponse = {
  ok: boolean;
  agentId: string;
  run: MagicTouchFlowRun;
};
