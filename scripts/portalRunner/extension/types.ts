export type { ReportWindow, RunDoc, RunStatus } from '../src/types';
// The original provider context is retained structurally while the extension uses
// browser report keys and a redacted logger instead of local paths and file logs.
export type RunnerCtx = {
  runId: string; run: any; env: Record<string, string | undefined>;
  setStatus: (id: string, patch: any) => Promise<void>;
  pollOtp: (id: string, timeout?: number) => Promise<string>;
  readOtp?: (id: string) => Promise<string>;
  clearOtp: (id: string) => Promise<void>;
  storage?: any; functions?: any; agentId?: string; runnerId?: string;
  paths?: {downloadsDir: string; logsDir: string};
  log?: {info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void};
};
export type RunnerHandler = (ctx: RunnerCtx) => Promise<void>;
