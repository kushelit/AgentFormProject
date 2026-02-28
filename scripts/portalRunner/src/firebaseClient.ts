// scripts/portalRunner/src/firebaseClient.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

import fs from "fs";
import path from "path";

export type RunnerConfig = {
  firebase?: {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    appId?: string;
    functionsRegion?: string;
  };
  runner?: {
    headless?: boolean;
    downloadDir?: string;
    pollIntervalMs?: number;
    clalPortalUrl?: string;
    migdalPortalUrl?: string;
    migdalDebug?: string | boolean;
  };
};

function reqEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function optEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  return v || undefined;
}

function loadConfig(): RunnerConfig | null {
  // 1. אם הוגדר ENV מפורש
  if (process.env.RUNNER_CONFIG_PATH) {
    const p = process.env.RUNNER_CONFIG_PATH;
    try {
      if (fs.existsSync(p)) {
        console.log("[Config] Loaded from RUNNER_CONFIG_PATH:", p);
        return JSON.parse(fs.readFileSync(p, "utf8"));
      }
    } catch (e: any) {
      console.error("[Config] Failed from RUNNER_CONFIG_PATH:", e?.message);
    }
  }

  // 2. AppData\Roaming\MagicSaleRunner\config.json
  const appDataPath = path.join(
    process.env.APPDATA || "",
    "MagicSaleRunner",
    "config.json"
  );

  try {
    if (fs.existsSync(appDataPath)) {
      console.log("[Config] Loaded from AppData:", appDataPath);
      return JSON.parse(fs.readFileSync(appDataPath, "utf8"));
    }
  } catch (e: any) {
    console.error("[Config] Failed from AppData:", e?.message);
  }

  // 3. fallback לפיתוח בלבד (cwd)
  const localPath = path.resolve(process.cwd(), "config.json");
  try {
    if (fs.existsSync(localPath)) {
      console.log("[Config] Loaded from CWD:", localPath);
      return JSON.parse(fs.readFileSync(localPath, "utf8"));
    }
  } catch (e: any) {
    console.error("[Config] Failed from CWD:", e?.message);
  }

  console.warn("[Config] No config.json found.");
  return null;
}


function reqPickFirebase(config: RunnerConfig | null, key: keyof NonNullable<RunnerConfig["firebase"]>, envName: string) {
  const v = (config?.firebase as any)?.[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return reqEnv(envName);
}

function optPickFirebase(config: RunnerConfig | null, key: keyof NonNullable<RunnerConfig["firebase"]>, envName: string) {
  const v = (config?.firebase as any)?.[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return optEnv(envName);
}

export function initFirebaseClient() {
  const config = loadConfig();
  const runner = config?.runner;

  if (!getApps().length) {
    initializeApp({
      apiKey: reqPickFirebase(config, "apiKey", "FIREBASE_API_KEY_RUNNER"),
      authDomain: reqPickFirebase(config, "authDomain", "FIREBASE_AUTH_DOMAIN"),
      projectId: reqPickFirebase(config, "projectId", "FIREBASE_PROJECT_ID"),
      storageBucket: reqPickFirebase(config, "storageBucket", "FIREBASE_STORAGE_BUCKET"),
      appId: optPickFirebase(config, "appId", "FIREBASE_APP_ID"),
    });
  }

  const auth = getAuth();
  const db = getFirestore();
  const storage = getStorage();

  // region: קודם config, אחר כך ENV, אחרון default
  const region =
    (config?.firebase?.functionsRegion && String(config.firebase.functionsRegion).trim()) ||
    optEnv("FIREBASE_FUNCTIONS_REGION") ||
    "us-central1";

  const functions = getFunctions(getApps()[0], region);

  // Emulator נשאר דרך ENV (לא חובה לייצור)
  const useEmu = String(process.env.FIREBASE_FUNCTIONS_EMULATOR || "").trim() === "1";
  if (useEmu) {
    const host = optEnv("FIREBASE_FUNCTIONS_EMULATOR_HOST") || "localhost";
    const port = Number(process.env.FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001);
    connectFunctionsEmulator(functions, host, port);
    console.log("[FirebaseClient] functions emulator:", `${host}:${port}`);
  } else {
    console.log("[FirebaseClient] functions region:", region);
  }

  // bucket בפועל מה-app (הכי בטוח), fallback לקונפיג/ENV
  const effectiveBucket =
    (storage as any)?.app?.options?.storageBucket ||
    config?.firebase?.storageBucket ||
    process.env.FIREBASE_STORAGE_BUCKET;

  return { auth, db, storage, functions, config, runner, effectiveBucket };
}