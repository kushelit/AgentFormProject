import type { RunnerEnv } from "./types";

export function buildEnv(overrides?: Partial<RunnerEnv>): RunnerEnv {
  return {

    RUNNER_ID: process.env.RUNNER_ID,
    HEADLESS: process.env.HEADLESS,
    DOWNLOAD_DIR: process.env.DOWNLOAD_DIR,

    ...overrides,
  };
}
