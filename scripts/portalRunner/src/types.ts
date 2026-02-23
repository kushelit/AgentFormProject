// scripts/portalRunner/src/types.ts
import type admin from "firebase-admin";
import type { FirebaseStorage } from "firebase/storage";

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
  | "error"
  | "skipped";;

export type RunDoc = {
  agentId: string;
  companyId: string;
  templateId: string;
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

  // (לא חובה) תוצאות ריצה
  result?: Record<string, any>;
};

export type RunnerEnv = {
  FIREBASE_ADMIN_KEY_PATH?: string;

  // ✅ חדש (ללוקאל)
  FIREBASE_STORAGE_BUCKET?: string;
  // (אם את עדיין צריכה בקלאוד/אדמין נשאיר)
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;

  RUNNER_ID?: string;
  HEADLESS?: string;
  DOWNLOAD_DIR?: string;

  CLAL_PORTAL_URL?: string;
  CLAL_TEST_MONTH_YM?: string;
  CLAL_TEST_MONTH_LABEL?: string;

  MIGDAL_PORTAL_URL?: string;
  MIGDAL_DEBUG?: string;

  FENIX_PORTAL_URL?: string;

MENORA_PORTAL_URL?: string;
MENORA_PHONE_NUMBER?: string; // אם צריך להזין מספר טלפון/סוכן בשלב SAPN

};

export type RunnerCtx = {
  runId: string;
  run: RunDoc;
  env: RunnerEnv;

  setStatus: (runId: string, patch: Partial<RunDoc> & Record<string, any>) => Promise<void>;
  pollOtp: (runId: string, timeoutMs?: number) => Promise<string>;
  clearOtp: (runId: string) => Promise<void>;

  // ✅ בענן יש admin, בלוקאל אין
  admin?: typeof import("firebase-admin") | null;

  // ✅ בלוקאל יש Client SDK
  storage?: any;

  // ✅ תמיד טוב שיהיה (בלוקאל מגיע מה-login; בענן מגיע מה-run)
  agentId?: string;
  runnerId?: string;
};

export type RunnerHandler = (ctx: RunnerCtx) => Promise<void>;
