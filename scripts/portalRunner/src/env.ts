import type { RunnerEnv } from "./types";

export function buildEnv(overrides?: Partial<RunnerEnv>): RunnerEnv {
  return {
    FIREBASE_ADMIN_KEY_PATH: process.env.FIREBASE_ADMIN_KEY_PATH,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,

    RUNNER_ID: process.env.RUNNER_ID,
    HEADLESS: process.env.HEADLESS,
    DOWNLOAD_DIR: process.env.DOWNLOAD_DIR,

    ...overrides,
  };
}
