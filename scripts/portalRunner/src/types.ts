import type admin from "firebase-admin";
import type { FirebaseStorage } from "firebase/storage";

/* ===============================
   Window / Date Range
================================= */

export type MonthSpec = {
  kind: "month";
  ym: string; // YYYY-MM
  label?: string;
};

export type RangeSpec = {
  kind: "range";
  fromYm: string; // YYYY-MM
  toYm: string; // YYYY-MM
  label?: string;
};

export type ReportWindow = MonthSpec | RangeSpec;

/* ===============================
   Run Status
================================= */

export type RunStatus =
  | "queued"
  | "running"
  | "otp_required"
  | "logged_in"
  | "file_uploaded"
  | "done"
  | "error"
  | "skipped";

/* ===============================
   Download Item (חדש)
================================= */

export type DownloadItem = {
  /**
   * איזה template הקובץ הזה מייצג
   * חשוב במיוחד כשבאותה ריצה מורידים כמה קבצים
   */
  templateId?: string;

  localPath?: string;
  filename?: string;
  storagePath?: string;
  bucket?: string;

  /**
   * אופציונלי – עוזר לדיבוג / UI
   */
  sourceFileName?: string;
  uploadedAt?: admin.firestore.Timestamp;
};

/* ===============================
   Run Document (portalImportRuns)
================================= */

export type RunDoc = {
  agentId: string;
  companyId: string;

  /**
   * templateId "ראשי"
   * בריצות multi-file זה יכול להיות bundle/meta
   * כל קובץ בפועל נשמר ב-downloads[]
   */
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

  /**
   * ✅ חדש – רשימת כל הקבצים שהורדו/הועלו בריצה
   */
  downloads?: DownloadItem[];

  /**
   * ⚠️ תאימות לאחור – קובץ יחיד (ישן)
   * נשאר כדי לא לשבור UI/קוד קיים (אצלך זה “הקובץ האחרון”)
   */
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

  /**
   * תוצאות ריצה חופשיות (למשל result.uploaded)
   */
  result?: Record<string, any>;
};

/* ===============================
   Runner Environment
================================= */

export type RunnerEnv = {
  FIREBASE_ADMIN_KEY_PATH?: string;

  // בלוקאל
  FIREBASE_STORAGE_BUCKET?: string;

  // בקונפיג וובי אם נדרש
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
  MENORA_PHONE_NUMBER?: string;
};

/* ===============================
   Runner Context
================================= */

export type RunnerCtx = {
  runId: string;
  run: RunDoc;
  env: RunnerEnv;

  setStatus: (runId: string, patch: Partial<RunDoc> & Record<string, any>) => Promise<void>;

  pollOtp: (runId: string, timeoutMs?: number) => Promise<string>;
  clearOtp: (runId: string) => Promise<void>;

  // בענן
  admin?: typeof import("firebase-admin") | null;

  // בלוקאל
  storage?: FirebaseStorage | any;

  agentId?: string;
  runnerId?: string;
};

export type RunnerHandler = (ctx: RunnerCtx) => Promise<void>;