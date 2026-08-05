/* eslint-disable @typescript-eslint/no-explicit-any */

export type MagicTouchJobAction =
  | "processWaitingPowerOfAttorneySignatures";

export type MagicTouchJobSchedule =
  | {
    type: "manual";
    timeZone: string;
  }
  | {
    type: "interval";
    every: number;
    unit: "hours" | "days";
    timeZone: string;
  }
  | {
    type: "daily";
    hour: number;
    minute: number;
    timeZone: string;
  }
  | {
    type: "monthly";
    dayOfMonth: number;
    hour: number;
    minute: number;
    timeZone: string;
  };

export type MagicTouchJobScope =
  | {
    type: "all_eligible_agents";
    integration?: string | null;
    integrationAction?: string | null;
  }
  | {
    type: "specific_agent";
    agentId: string;
  };

export type MagicTouchJobDefinition = {
  jobId: string;
  name: string;
  description: string;
  action: MagicTouchJobAction;
  enabled: boolean;
  scope: MagicTouchJobScope;
  schedule: MagicTouchJobSchedule;
  nextRunAt?: any;
  lastRunAt?: any;
  lastRunStatus?: "running" | "success" | "failed" | null;
  lastRunSummary?: Record<string, unknown> | null;
  lastRunError?: string | null;
  runningRunId?: string | null;
  lockUntil?: any;
  createdAt?: any;
  updatedAt?: any;
  updatedBy?: string | null;
};

export type MagicTouchJobRunSource =
  | "manual"
  | "scheduler";

export type MagicTouchJobRun = {
  runId: string;
  jobId: string;
  jobName: string;
  action: MagicTouchJobAction;
  source: MagicTouchJobRunSource;
  status: "running" | "success" | "failed";
  requestedBy?: string | null;
  startedAt: any;
  completedAt?: any;
  summary?: Record<string, unknown> | null;
  error?: string | null;
};
