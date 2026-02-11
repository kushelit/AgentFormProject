// scripts/portalRunner/src/types.ts
import type admin from "firebase-admin";

export type MonthSpec = { kind: "month"; ym: string; label?: string };
export type RangeSpec = { kind: "range"; fromYm: string; toYm: string; label?: string };
export type ReportWindow = MonthSpec | RangeSpec;

export type RunStatus =
  | "queued"
  | "running"
  | "otp_required"
  | "logged_in"
  | "file_uploaded"
  | "done"
  | "error";

export type RunDoc = {
  agentId: string;
  companyId: string;
  templateId: string;

  // זה מה שמחליט איזה provider לרוץ
  automationClass: string;

  status: RunStatus;

  requestedWindow?: ReportWindow;
  resolvedWindow?: ReportWindow;
  monthLabel?: string;

  otp?: {
    mode?: "firestore" | "manual";
    state?: "none" | "required"; 
    value?: string;
    hint?: string;
  };
  

  download?: {
    localPath?: string;
    filename?: string;
    storagePath?: string;
    bucket?: string;
  };

  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;

  runner?: {
    id?: string;
    claimedAt?: admin.firestore.Timestamp;
  };

  error?: {
    step?: string;
    message?: string;
  };
};

export type RunnerEnv = {
  FIREBASE_ADMIN_KEY_PATH?: string;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;

  RUNNER_ID?: string;
  HEADLESS?: string;
  DOWNLOAD_DIR?: string;

  CLAL_PORTAL_URL?: string;

  CLAL_TEST_MONTH_YM?: string;
  CLAL_TEST_MONTH_LABEL?: string;

  // אם תרצי בעתיד:
  MIGDAL_PORTAL_URL?: string;
  MIGDAL_DEBUG?: string; // ✅ הוספה
};

export type RunnerCtx = {
  runId: string;
  run: RunDoc;
  env: RunnerEnv;

  setStatus: (runId: string, patch: Partial<RunDoc> & Record<string, any>) => Promise<void>;
  pollOtp: (runId: string, timeoutMs?: number) => Promise<string>;
  clearOtp: (runId: string) => Promise<void>;

  admin: typeof import("firebase-admin");
};

export type RunnerHandler = (ctx: RunnerCtx) => Promise<void>;
