// src/lib/portalRuns/runnerMode.ts
export type RunnerMode = "local" | "cloud";

// NEXT_PUBLIC כדי שה-Client יוכל להחליט אם לקרוא API או לא
export function getRunnerMode(): RunnerMode {
  const v = String(process.env.NEXT_PUBLIC_RUNNER_MODE || "local").trim().toLowerCase();
  return v === "cloud" ? "cloud" : "local";
}

export function isCloudMode(): boolean {
  return getRunnerMode() === "cloud";
}
