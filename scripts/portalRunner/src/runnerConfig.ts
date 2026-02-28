import fs from "fs";
import path from "path";
import os from "os";

export type RunnerConfig = {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    functionsRegion?: string;
    appId?: string;
  };
  headless?: boolean;
  downloadDir?: string;
};

function defaultConfigDir() {
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appdata, "MagicSaleRunner");
  }
  return path.join(os.homedir(), ".magicsale-runner");
}

export function getDefaultConfigPath() {
  return path.join(defaultConfigDir(), "runner.config.json");
}

export function readRunnerConfig(): RunnerConfig {
  const configPath = getDefaultConfigPath();

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Missing runner config: ${configPath}\n` +
      `Create runner.config.json in that folder (same place as session.json).`
    );
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const cfg = JSON.parse(raw) as RunnerConfig;

  // מינימום ולידציה
  if (!cfg?.firebase?.apiKey) throw new Error("Invalid config: firebase.apiKey missing");
  if (!cfg?.firebase?.authDomain) throw new Error("Invalid config: firebase.authDomain missing");
  if (!cfg?.firebase?.projectId) throw new Error("Invalid config: firebase.projectId missing");
  if (!cfg?.firebase?.storageBucket) throw new Error("Invalid config: firebase.storageBucket missing");

  return cfg;
}