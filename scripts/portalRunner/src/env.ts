import type { RunnerEnv } from "./types";

export function buildEnv(overrides?: Partial<RunnerEnv>): RunnerEnv {
  return {
    FIREBASE_ADMIN_KEY_PATH: process.env.FIREBASE_ADMIN_KEY_PATH,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,

    RUNNER_ID: process.env.RUNNER_ID,
    HEADLESS: process.env.HEADLESS,
    DOWNLOAD_DIR: process.env.DOWNLOAD_DIR,

    CLAL_PORTAL_URL: process.env.CLAL_PORTAL_URL,
    CLAL_TEST_MONTH_YM: process.env.CLAL_TEST_MONTH_YM,
    CLAL_TEST_MONTH_LABEL: process.env.CLAL_TEST_MONTH_LABEL,

    ...overrides,
  };
}
